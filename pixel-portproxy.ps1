# pixel-portproxy.ps1
# Ejecutar como Administrador una sola vez
$wslIp = (wsl -d Ubuntu hostname -I).Split(' ')[0].Trim()
Write-Host "WSL IP detectada: $wslIp" -ForegroundColor Cyan

$ports = @(3001, 4006, 8080)
foreach ($port in $ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp
    netsh advfirewall firewall delete rule name="WSL_Pixel_$port" 2>$null
    netsh advfirewall firewall add rule name="WSL_Pixel_$port" dir=in action=allow protocol=TCP localport=$port
    Write-Host "✅ Puerto $port configurado -> $wslIp`:$port" -ForegroundColor Green
}

Write-Host "`nPort proxy activo:" -ForegroundColor Yellow
netsh interface portproxy show v4tov4
Write-Host "`nAhora puedes usar:" -ForegroundColor Cyan
Write-Host "  http://localhost:3001/health  (Backend API)" -ForegroundColor White
Write-Host "  http://localhost:4006          (Frontend)"   -ForegroundColor White
Write-Host "  http://localhost:8080          (Adminer DB)" -ForegroundColor White
