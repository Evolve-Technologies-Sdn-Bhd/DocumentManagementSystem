[OPEN] Debug Session: master-record-preview-link

## Symptom
- Dalam module Master Record, user klik satu record tetapi preview membuka document lain atau preview target tidak sepadan dengan row yang dipaparkan.

## Debug Server
- URL: `http://127.0.0.1:7777/event`
- Log file: `.dbg/trae-debug-log-master-record-preview-link.ndjson`

## Scope
- Fokus pada flow `New Document Register` dalam `Master Record`.
- Jangan ubah business logic sebelum ada runtime evidence.

## Hypotheses
1. `documentRegister` row tiada direct foreign key ke `document.id`, jadi mapping semasa memilih document yang salah.
2. Terdapat lebih daripada satu `document` dengan kombinasi `fileCode` dan `projectCategoryId` yang sama, menyebabkan padanan ambiguous.
3. Browser masih memanggil alias/endpoint lama yang tidak mengandungi mapping fix terbaru.
4. Sort/order antara query list dan query preview tidak konsisten, jadi dokumen yang dipilih bukan dokumen yang mewakili row itu.
5. Frontend modal preview reuse state lama dan overwrite target preview semasa user klik row lain.

## Plan
- Tambah instrumentation pada endpoint list Master Record dan pada flow preview frontend.
- Reproduce isu dan kumpul log runtime.
- Tentukan hipotesis yang sah / tertolak berdasarkan evidence.
- Buat minimal fix.

## Current Status
- Instrumentation telah ditambah pada:
  - `backend/src/routes/reports.js`
  - `backend/src/controllers/documentController.js`
  - `frontend/src/pages/MasterRecord.jsx`
  - `frontend/src/components/DocumentViewerModal.jsx`
- Route `new-documents` telah diubah untuk sumber data datang terus daripada `document` table, bukan `documentRegister`, supaya setiap row ada `documentId` sebenar dan tidak perlu heuristic mapping.
- Menunggu verifikasi user selepas backend restart dan reproduce flow.
