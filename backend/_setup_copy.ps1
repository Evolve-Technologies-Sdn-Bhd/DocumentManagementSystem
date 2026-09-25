$src = "C:\xampp\mysql\data\aria_log.00000001"
$dst = "c:\Users\USER\Desktop\DocumentManagementSystem\backend\mysql-local-data\aria_log.00000001"
$tmpDir = "c:\Users\USER\Desktop\DocumentManagementSystem\backend\mysql-local-tmp"
if (Test-Path $src -and !(Test-Path $dst)) {
    Copy-Item $src $dst -Force
    "COPIED aria_log"
} elseif (Test-Path $dst) {
    "aria_log already exists at dest"
} else {
    "SOURCE MISSING"
}
if (!(Test-Path $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    "CREATED tmp dir"
} else {
    "tmp dir exists"
}
