@echo off
setlocal
cd /d "%~dp0"

echo SpecDriven Platform — subindo API + portais...
echo.
echo  API:            http://localhost:3000
echo  Portal cliente: http://localhost:5173
echo  Portal staff:   http://localhost:5174
echo.
echo Certifique-se de que o Docker (Postgres) esta no ar e o .env existe.
echo (Opcional: npm run db:push ^&^& npm run db:seed)
echo.

start "SpecDriven API" cmd /k "npm run dev:api"
start "SpecDriven Web Client" cmd /k "npm run dev:web-client"
start "SpecDriven Web Staff" cmd /k "npm run dev:web-staff"

echo Tres terminais abertos. Feche cada janela para encerrar o servico.
endlocal
