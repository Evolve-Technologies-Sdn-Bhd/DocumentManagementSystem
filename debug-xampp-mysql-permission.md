# XAMPP MySQL Permission Debug Session

- **Session ID**: xampp-mysql-permission
- **Status**: [OPEN]
- **Date**: 2026-09-22
- **OS**: Windows
- **Symptoms**:
  - mysqld.exe cannot start from terminal. Log shows: `Errcode: 13 "Permission denied"` when creating test file `C:\xampp\mysql\data\Tech11.lower-test` and InnoDB file ops error 5
  - `prisma migrate deploy` cannot run because DB socket missing
- **Expected**: MariaDB 10.4.32 starts on port 3306, Prisma migrate deploy runs successfully creating Calendar* tables and enums, backend + frontend serve on 4001/5173

## Falsifiable Hypotheses
1. **H1**: NTFS ACL on `C:\xampp\mysql\data` is set to Admin-only; current sandbox user lacks write → (Fix: `icacls /grant Everyone:(OI)(CI)F`)
2. **H2**: Read-only flag set on files/subdirs inside data dir → (Fix: `attrib -r`)
3. **H3**: mysqld.exe from sandbox has no Win32 write access → (Fix: copy data dir to user-writable path like `C:\Users\USER\AppData\Local\mysql-data` and start with `--datadir=...`)
4. **H4**: Existing stale mysqld.pid / socket file / aria_log is locked from prior crash → (Fix: remove stale files after kill)
5. **H5**: my.ini `tmpdir` points to un-writable location or `lower_case_table_names` fs setting requires write test → (Fix: custom my.ini with tmpdir override)

## Session Log
| Step | Time | Action | Result | Evidence |
|------|------|--------|--------|----------|
| 1 | 11:54 | Kill any mysqld | - | - |
| 2 | 12:00 | Try icacls grant on data dir | - | - |
