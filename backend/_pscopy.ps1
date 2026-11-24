$src = "C:\xampp\mysql\data\aria_log.00000001"
$dst = "c:\Users\USER\Desktop\DocumentManagementSystem\backend\mysql-local-data\aria_log.00000001"
$tmpDir = "c:\Users\USER\Desktop\DocumentManagementSystem\backend\mysql-local-tmp"
$log = "c:\Users\USER\Desktop\DocumentManagementSystem\backend\_pscopy.log"

"START" | Set-Content $log
"Src exists: $(Test-Path $src)" | Add-Content $log
"Dst before: $(Test-Path $dst)" | Add-Content $log

if ((Test-Path $src) -and -(Test-Path $dst)) {
    Copy-Item -Path $src -Destination $dst -Force
    "Copied" | Add-Content $log
}

if (!(Test-Path $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir -Force
    "Created tmp" | Add-Content $log
}

"Dst after: $(Test-Path $dst)" | Add-Content $log
"Tmp exists: $(Test-Path $tmpDir)" | Add-Content $log
"END" | Add-Content $log
