use crate::domain::error::{AppError, AppResult};
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

/// Image to embed at the end of the generated document.
pub struct PrintImage {
    pub bytes: Vec<u8>,
    pub extension: String, // png | jpeg | jpg
    pub caption: Option<String>,
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn multiline_to_word_breaks(escaped: &str) -> String {
    escaped
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', "</w:t><w:br/><w:t xml:space=\"preserve\">")
}

pub fn replace_placeholders(
    xml: &str,
    values: &HashMap<String, String>,
    empty_placeholder: &str,
) -> String {
    let mut out = xml.to_string();
    let re = Regex::new(r"\{\{([a-z0-9_]+)\}\}").expect("regex");
    out = re
        .replace_all(&out, |caps: &regex::Captures| {
            let key = &caps[1];
            let raw = values
                .get(key)
                .map(|s| s.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(empty_placeholder);
            let escaped = escape_xml(raw);
            multiline_to_word_breaks(&escaped)
        })
        .to_string();
    out
}

fn ensure_drawing_namespaces(document_xml: &str) -> String {
    let mut xml = document_xml.to_string();
    let ns = [
        (
            "xmlns:r=",
            r#"xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#,
        ),
        (
            "xmlns:wp=",
            r#"xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing""#,
        ),
        (
            "xmlns:a=",
            r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main""#,
        ),
        (
            "xmlns:pic=",
            r#"xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture""#,
        ),
    ];
    for (needle, decl) in ns {
        if !xml.contains(needle) {
            xml = xml.replacen("<w:document ", &format!("<w:document {decl} "), 1);
        }
    }
    xml
}

fn next_rel_id(rels_xml: &str) -> u32 {
    let re = Regex::new(r#"Id="rId(\d+)""#).expect("regex");
    re.captures_iter(rels_xml)
        .filter_map(|c| c.get(1)?.as_str().parse::<u32>().ok())
        .max()
        .unwrap_or(1)
        .saturating_add(1)
}

fn content_type_for_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "application/octet-stream",
    }
}

fn ensure_content_types(ct_xml: &str, extensions: &[&str]) -> String {
    let mut xml = ct_xml.to_string();
    for ext in extensions {
        let needle = format!(r#"Extension="{ext}""#);
        if xml.contains(&needle) {
            continue;
        }
        let default = format!(
            r#"<Default Extension="{ext}" ContentType="{}"/>"#,
            content_type_for_ext(ext)
        );
        if let Some(pos) = xml.find("</Types>") {
            xml.insert_str(pos, &default);
        }
    }
    xml
}

fn image_paragraph(rel_id: u32, cx: u64, cy: u64, caption: Option<&str>) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        r#"<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{rel_id}" name="Print{rel_id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image{rel_id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId{rel_id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"#
    ));
    if let Some(cap) = caption.filter(|s| !s.trim().is_empty()) {
        out.push_str(&format!(
            r#"<w:p><w:r><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
            escape_xml(cap)
        ));
    }
    out.push_str(r#"<w:p><w:r><w:t></w:t></w:r></w:p>"#);
    out
}

fn read_image_px(bytes: &[u8], ext: &str) -> Option<(u32, u32)> {
    match ext {
        "png" if bytes.len() >= 24 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" => {
            let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
            let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
            Some((w, h))
        }
        "jpg" | "jpeg" => jpeg_size(bytes),
        _ => None,
    }
}

fn jpeg_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut i = 2usize;
    while i + 9 < bytes.len() {
        if bytes[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = bytes[i + 1];
        if marker == 0xD9 || marker == 0xDA {
            break;
        }
        if i + 3 >= bytes.len() {
            break;
        }
        let len = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
        // SOF0..SOF3
        if (0xC0..=0xC3).contains(&marker) && i + 8 < bytes.len() {
            let h = u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]) as u32;
            let w = u16::from_be_bytes([bytes[i + 7], bytes[i + 8]]) as u32;
            return Some((w, h));
        }
        i += 2 + len;
    }
    None
}

fn emu_size(bytes: &[u8], ext: &str) -> (u64, u64) {
    const MAX_CX: u64 = 5_400_000; // ~15cm
    let (w, h) = read_image_px(bytes, ext).unwrap_or((1600, 900));
    let w = w.max(1) as u64;
    let h = h.max(1) as u64;
    let cx = MAX_CX;
    let cy = (MAX_CX * h) / w;
    (cx, cy.max(100_000))
}

pub fn generate_from_template(
    template_bytes: &[u8],
    values: &HashMap<String, String>,
    empty_placeholder: &str,
    dest: &Path,
    images: &[PrintImage],
) -> AppResult<()> {
    let cursor = std::io::Cursor::new(template_bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| {
        AppError::template(format!("Template .docx inválido: {e}"))
    })?;

    let mut entries: HashMap<String, Vec<u8>> = HashMap::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = file.name().to_string();
        let mut data = Vec::new();
        file.read_to_end(&mut data)?;
        entries.insert(name, data);
    }

    // Replace placeholders in document / headers / footers
    let keys: Vec<String> = entries.keys().cloned().collect();
    for name in keys {
        let should_replace = name == "word/document.xml"
            || (name.starts_with("word/header") && name.ends_with(".xml"))
            || (name.starts_with("word/footer") && name.ends_with(".xml"));
        if !should_replace {
            continue;
        }
        if let Some(data) = entries.get_mut(&name) {
            let xml = String::from_utf8_lossy(data);
            *data = replace_placeholders(&xml, values, empty_placeholder).into_bytes();
        }
    }

    if !images.is_empty() {
        let mut doc_xml = String::from_utf8_lossy(
            entries
                .get("word/document.xml")
                .ok_or_else(|| AppError::template("Template sem word/document.xml"))?,
        )
        .to_string();
        doc_xml = ensure_drawing_namespaces(&doc_xml);

        let mut rels_xml = entries
            .get("word/_rels/document.xml.rels")
            .map(|b| String::from_utf8_lossy(b).to_string())
            .unwrap_or_else(|| {
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>"#.to_string()
            });

        let mut ct_xml = entries
            .get("[Content_Types].xml")
            .map(|b| String::from_utf8_lossy(b).to_string())
            .unwrap_or_else(|| {
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>"#.to_string()
            });

        let mut next_id = next_rel_id(&rels_xml);
        let mut block = String::from(
            r#"<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Prints</w:t></w:r></w:p><w:p><w:r><w:t></w:t></w:r></w:p>"#,
        );
        let mut used_exts: Vec<&str> = Vec::new();

        for (idx, img) in images.iter().enumerate() {
            let ext = match img.extension.to_ascii_lowercase().as_str() {
                "png" => "png",
                "jpg" => "jpg",
                "jpeg" => "jpeg",
                other => {
                    return Err(AppError::validation(format!(
                        "Formato de print não suportado: .{other}"
                    )));
                }
            };
            if !used_exts.contains(&ext) {
                used_exts.push(ext);
            }
            let media_name = format!("word/media/print{}.{}", idx + 1, ext);
            let rel_target = format!("media/print{}.{}", idx + 1, ext);
            let rel_id = next_id;
            next_id += 1;

            entries.insert(media_name, img.bytes.clone());

            let rel = format!(
                r#"<Relationship Id="rId{rel_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{rel_target}"/>"#
            );
            if let Some(pos) = rels_xml.rfind("</Relationships>") {
                rels_xml.insert_str(pos, &rel);
            }

            let (cx, cy) = emu_size(&img.bytes, ext);
            block.push_str(&image_paragraph(
                rel_id,
                cx,
                cy,
                img.caption.as_deref(),
            ));
        }

        ct_xml = ensure_content_types(&ct_xml, &used_exts);

        if let Some(pos) = doc_xml.rfind("</w:body>") {
            doc_xml.insert_str(pos, &block);
        } else {
            return Err(AppError::template("document.xml sem </w:body>"));
        }

        entries.insert("word/document.xml".into(), doc_xml.into_bytes());
        entries.insert("word/_rels/document.xml.rels".into(), rels_xml.into_bytes());
        entries.insert("[Content_Types].xml".into(), ct_xml.into_bytes());
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let dest_file = fs::File::create(dest)?;
    let mut writer = ZipWriter::new(dest_file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut names: Vec<_> = entries.keys().cloned().collect();
    names.sort();
    for name in names {
        let data = entries.get(&name).unwrap();
        writer.start_file(name, options)?;
        writer.write_all(data)?;
    }
    writer.finish()?;
    Ok(())
}

pub fn required_fields(doc_type: &str) -> &'static [&'static str] {
    match doc_type {
        "ef" => &[
            "cliente",
            "chave",
            "titulo",
            "autor",
            "data",
            "versao",
            "objetivo",
            "escopo",
            "regras_negocio",
        ],
        "et" => &[
            "cliente",
            "chave",
            "titulo",
            "autor",
            "data",
            "versao",
            "resumo_solucao",
            "arquitetura",
            "componentes",
        ],
        "testes_unitarios" => &[
            "cliente",
            "chave",
            "titulo",
            "autor",
            "data",
            "versao",
            "objetivo_testes",
            "cenarios",
        ],
        _ => &[],
    }
}

pub fn validate_required(
    doc_type: &str,
    values: &HashMap<String, String>,
) -> AppResult<()> {
    let mut missing = Vec::new();
    for field in required_fields(doc_type) {
        let empty = values
            .get(*field)
            .map(|s| s.trim().is_empty())
            .unwrap_or(true);
        if empty {
            missing.push(*field);
        }
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(AppError::validation(format!(
            "Campos obrigatórios pendentes: {}",
            missing.join(", ")
        )))
    }
}

pub fn load_print_images(prints_dir: &Path, meta: &[crate::domain::models::DraftPrint]) -> AppResult<Vec<PrintImage>> {
    let mut out = Vec::new();
    for item in meta {
        let path = prints_dir.join(&item.file_name);
        if !path.exists() {
            continue;
        }
        let bytes = fs::read(&path)?;
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png")
            .to_ascii_lowercase();
        out.push(PrintImage {
            bytes,
            extension: ext,
            caption: item.caption.clone(),
        });
    }
    Ok(out)
}

pub fn prints_dir_name(doc_type: &str) -> AppResult<&'static str> {
    match doc_type {
        "ef" => Ok("ef-prints"),
        "et" => Ok("et-prints"),
        "testes_unitarios" => Ok("testes-unitarios-prints"),
        _ => Err(AppError::validation("Tipo de documento inválido")),
    }
}

pub fn resolve_prints_dir(ticket: &Path, doc_type: &str) -> AppResult<PathBuf> {
    Ok(ticket.join("drafts").join(prints_dir_name(doc_type)?))
}
