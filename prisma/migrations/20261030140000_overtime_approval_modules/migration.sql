-- Approval overtime (2026-10-30): sesi overtime → Ko Yosep; reimburse overtime memakai alur modul OVERTIME_REIMBURSE (Ci Ika).
ALTER TYPE "ApprovalModule" ADD VALUE 'OVERTIME';
ALTER TYPE "ApprovalModule" ADD VALUE 'OVERTIME_REIMBURSE';
