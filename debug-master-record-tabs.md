# Debug Session: master-record-tabs

Status: OPEN

## Scope
- Export gagal untuk tab `New Version Register`
- Export gagal untuk tab `Consolidated Registry`
- Tab `Obsolete Register` blank / tak boleh buka
- Tab `Old Version Register` blank / tak boleh buka

## Initial Hypotheses
- Rujukan util eksport atau pembinaan dataset menggunakan simbol global yang tidak wujud di build production.
- Salah satu mapper untuk tab tertentu akses pemboleh ubah yang tidak diisytiharkan, menyebabkan render/export crash.
- Data response API bagi obsolete/old version tak dipetakan mengikut shape sebenar lalu melempar error semasa render.
- Konfigurasi kolum atau filter untuk tab tertentu guna helper yang undefined hanya bila tab tersebut aktif.
- Satu dependency pihak ketiga untuk eksport dipanggil secara tidak serasi dalam komponen `MasterRecord`.

## Evidence Log
- Screenshot console menunjukkan `ReferenceError: EmptyState is not defined` semasa buka tab register tertentu.
- `frontend/src/pages/MasterRecord.jsx` merujuk `<EmptyState />` dalam `New Version Register`, `Obsolete Register`, `Old Version Register`, dan `Consolidated Register`, tetapi komponen tersebut tidak diimport.
- `frontend/src/pages/MasterRecord.jsx` sebelum fix hanya memaparkan `alert('Exporting New Version Register...')` untuk `New Version Register`.
- `frontend/src/pages/MasterRecord.jsx` sebelum fix memaparkan mesej `Excel export is disabled.` untuk `Consolidated Registry`.
- `backend/src/routes/reports.js` sudah menyediakan endpoint data untuk `/reports/master-record/version-register` dan `/reports/master-record/consolidated`, jadi isu export berada di frontend.

## Fix Log
- Tambah import `EmptyState` dalam `frontend/src/pages/MasterRecord.jsx` supaya tab `Obsolete Register`, `Old Version Register`, dan branch empty-state lain tidak lagi crash.
- Tambah helper export HTML table `.xls` dalam `frontend/src/pages/MasterRecord.jsx`.
- Sambungkan export `New Version Register` kepada endpoint `/reports/master-record/version-register`.
- Sambungkan export `Consolidated Registry` kepada endpoint `/reports/master-record/consolidated?export=excel`.
- Betulkan prop `AlertModal` dalam `ConsolidatedRegister` daripada `isOpen` kepada `show`.

## Verification
- `npm.cmd run build` dalam `frontend/` berjaya dengan exit code `0`.
- Perlu semakan UAT pengguna untuk sahkan:
  - tab `Obsolete Register` boleh dibuka tanpa blank page
  - tab `Old Version Register` boleh dibuka tanpa blank page
  - export `New Version Register` memuat turun fail `.xls`
  - export `Consolidated Registry` memuat turun fail `.xls`
