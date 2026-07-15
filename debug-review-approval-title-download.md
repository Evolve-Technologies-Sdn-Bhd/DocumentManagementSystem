[OPEN] Debug Session: review-approval-title-download

## Symptom
- Dalam module Review & Approval, user nak klik nama fail (doc title) untuk auto-download fail yang perlu direview/approve.
- Isu berkait dokumen `PENDING_REVIEW`: preview kadang-kadang 403 / tak sepadan, jadi download menjadi fallback utama.

## Expected
- Bila klik nama fail, sistem akan trigger download (ikut access control semasa).
- Jika user tiada akses download (403), UI tunjuk mesej jelas.

## Hypotheses
1. Klik pada doc title sekarang tak trigger apa-apa (anchor `href="#"` sahaja), sebab itu flow review bergantung pada ActionMenu.
2. Untuk dokumen `PENDING_REVIEW`, preview mungkin disekat → user perlukan flow download cepat dari title click.
3. Sesetengah row tiada `documentId` yang betul (guna `doc.id` lain), menyebabkan download target salah.
4. Download endpoint mengembalikan 403 untuk reviewer tertentu kerana folder permission `download` tak diberikan walaupun `view` ada.

## Debug Server
- URL: http://127.0.0.1:7777/event
- Log file: .dbg/trae-debug-log-master-record-preview-link.ndjson
