# ARSITEKTUR SISTEM — Office Automation System

## 1. Gambaran Umum

```
 ┌────────────────────────────────────────────┐
 │  Browser (Admin / Staf)                    │
 └─────────────────────┬──────────────────────┘
                       │ HTTPS
 ┌─────────────────────▼──────────────────────┐
 │           Next.js Application               │
 │  ┌─────────────┐  ┌──────────────────────┐ │
 │  │ UI (React,  │  │ Server Actions /      │ │
 │  │ App Router) │  │ Route Handlers        │ │
 │  └─────────────┘  └──────────┬───────────┘ │
 │  ┌────────────────────────────▼──────────┐ │
 │  │ Service Layer                          │ │
 │  │ Auth/RBAC · Approval · Numbering       │ │
 │  │ Employee · Leave · Health · Validation │ │
 │  └──────┬──────────────┬─────────────────┘ │
 └─────────┼──────────────┼───────────────────┘
           │              │
 ┌─────────▼──────┐ ┌─────▼──────────┐ ┌──────────────┐
 │ PostgreSQL     │ │ File Storage   │ │ Worker       │
 │ data + queue   │ │ Disk / S3      │ │ (pg-boss)    │
 │ (pg-boss)      │ │                │ │ email, cron  │
 └────────────────┘ └────────────────┘ └──────┬───────┘
                                              │ SMTP
                                       ┌──────▼───────┐
                                       │ Mail Server  │
                                       └──────────────┘
```

## 2. Lapisan Aplikasi

| Lapisan | Lokasi | Tanggung jawab |
|---|---|---|
| Presentation | `src/app`, `src/components` | Halaman, form, tabel; tidak berisi logika bisnis |
| Application | Server Actions di `src/app/**/actions.ts` | Cek session/role, validasi Zod, panggil service, audit, revalidate |
| Domain / Service | `src/lib/services` | Aturan bisnis murni; dapat diuji dengan Vitest |
| Data | `src/lib/db.ts`, `src/lib/storage` | Prisma client, adapter file |
| Background | `worker/` | Email, reminder, rollover cuti |

## 3. Alur Request (contoh: submit reimburse)

```
Form (client) ─► Server Action submitReimbursement
  ├─ requireUser()                      (auth)
  ├─ reimbursementSchema.parse()        (validasi)
  └─ prisma.$transaction:
       ├─ numbering.next("RMB")         → RMB/2026/09/0001
       ├─ update Reimbursement (PENDING, total)
       ├─ approval.build("REIMBURSE")   → ApprovalRequest + steps
       └─ audit.log(...)
  └─ setelah commit: mail.enqueue(approval-requested → approver L1)
Worker ─► kirim email via SMTP ─► EmailLog SENT
```

## 4. Alur Approval

```
Staf Engineer submit ─► PENDING (L1) ─► email Ko Yosep
Ko Yosep approve     ─► PENDING (L2) ─► email Ko Rudy + info pemohon
Ko Rudy approve      ─► APPROVED     ─► email pemohon + semua Admin

Ko Rudy / Ko Leonard submit ─► APPROVED langsung
Bu Devi submit       ─► PENDING ─► email Ko Rudy & Ko Leonard (salah satu approve = final)
Ci Ika klaim kesehatan ─► step Ika dilewati ─► FALLBACK Ko Rudy / Ko Leonard
```

## 5. Deployment

Semua komponen berjalan sebagai container sehingga siap untuk on-premise maupun cloud.

| Service | Dev | Produksi |
|---|---|---|
| app (Next.js) | `npm run dev` | container `next start` (output standalone) |
| worker | `npm run worker` | container terpisah, image sama |
| db | Docker Postgres | Postgres server kantor / managed |
| mail | Mailpit | SMTP kantor / provider |
| storage | folder lokal | volume server atau S3/MinIO |

Keputusan on-premise vs cloud belum ditentukan; hanya konfigurasi `.env` yang berbeda.
