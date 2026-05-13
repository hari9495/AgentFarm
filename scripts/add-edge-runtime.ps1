$routes = Get-ChildItem "d:\AgentFarm\apps\website\app\api" -Recurse -Filter "route.ts"
$count = 0
foreach ($route in $routes) {
    $content = [System.IO.File]::ReadAllText($route.FullName, [System.Text.Encoding]::UTF8)
    if ($content -notmatch "export const runtime") {
        $newContent = "export const runtime = 'edge'" + [System.Environment]::NewLine + [System.Environment]::NewLine + $content
        [System.IO.File]::WriteAllText($route.FullName, $newContent, [System.Text.Encoding]::UTF8)
        $count++
    }
}
Write-Host "Patched $count route files"

$layouts = @(
    "d:\AgentFarm\apps\website\app\dashboard\layout.tsx",
    "d:\AgentFarm\apps\website\app\admin\layout.tsx",
    "d:\AgentFarm\apps\website\app\portal\(app)\layout.tsx",
    "d:\AgentFarm\apps\website\app\company\layout.tsx"
)
foreach ($layout in $layouts) {
    if (Test-Path $layout) {
        $content = [System.IO.File]::ReadAllText($layout, [System.Text.Encoding]::UTF8)
        if ($content -notmatch "export const runtime") {
            $newContent = "export const runtime = 'edge'" + [System.Environment]::NewLine + [System.Environment]::NewLine + $content
            [System.IO.File]::WriteAllText($layout, $newContent, [System.Text.Encoding]::UTF8)
            Write-Host "Patched layout: $layout"
        }
    }
}
