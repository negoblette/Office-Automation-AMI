import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatNpwp, formatPhone } from "@/lib/format";
import { CERTIFICATE_TYPE_LABEL, DIVISION_LABEL, DOCUMENT_TYPE_LABEL, FAMILY_RELATION_LABEL, GENDER_LABEL, MARITAL_STATUS_LABEL } from "@/lib/labels";
import { listEmployeeAssetItems } from "@/lib/services/employee-asset";
import { getEmployeeCertificates, getEmployeeDetail, getEmployeeDocuments } from "@/lib/services/employee-queries";

export const metadata: Metadata = { title: "Biodata Karyawan" };

const date = (iso: string | null | undefined) => (iso ? formatDate(`${iso}T00:00:00Z`) : "—");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-black/30 pb-1 text-sm font-bold tracking-wider uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="align-top">
            <td className="w-56 py-1 pr-3 text-black/70">{label}</td>
            <td className="py-1 font-medium">{value || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Form biodata karyawan untuk dicetak / disimpan PDF (Fase 14). Karyawan sendiri atau Admin. */
export default async function BiodataPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const user = await requireUser();
  const { employeeId } = await params;
  if (user.role !== "ADMIN" && user.employeeId !== employeeId) redirect("/akses-ditolak");

  const [employee, documents, certificates, assets] = await Promise.all([
    getEmployeeDetail(prisma, employeeId),
    getEmployeeDocuments(prisma, employeeId),
    getEmployeeCertificates(prisma, employeeId),
    listEmployeeAssetItems(prisma, employeeId),
  ]);
  if (!employee || !documents) notFound();
  const currentPeriod = employee.periods[0];
  const uploaded = new Set(documents.documents.map((d) => d.docType));

  return (
    <>
      <PrintToolbar backHref={user.employeeId === employeeId ? "/profil" : `/karyawan/${employeeId}`} />
      <header className="mb-6 flex items-end justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-xs font-bold tracking-widest">PT ARTHA MITRA INTERDATA</p>
          <h1 className="text-2xl font-bold">Biodata Karyawan</h1>
        </div>
        <p className="text-xs text-black/60">Dicetak {formatDate(new Date())}</p>
      </header>

      <Section title="Data Karyawan">
        <Rows
          rows={[
            ["Nama lengkap", employee.fullName],
            ["NIP", employee.employeeNo ?? "Belum ada"],
            ["Jabatan", employee.position],
            ["Divisi", DIVISION_LABEL[employee.division]],
            ["Level / grade", employee.level],
            ["Tanggal masuk", date(currentPeriod?.startDate)],
            ["Email", employee.email],
          ]}
        />
      </Section>

      <Section title="Data Diri">
        <Rows
          rows={[
            ["NIK", employee.nik],
            ["Nomor KK", employee.kkNo],
            ["Tempat, tanggal lahir", [employee.birthPlace, employee.birthDate && date(employee.birthDate)].filter(Boolean).join(", ")],
            ["Jenis kelamin", employee.gender ? GENDER_LABEL[employee.gender] : null],
            ["Status pernikahan", MARITAL_STATUS_LABEL[employee.maritalStatus]],
            ["Alamat", employee.address],
            ["Nomor HP", employee.phone ? formatPhone(employee.phone) : null],
          ]}
        />
      </Section>

      <Section title="Pajak & BPJS">
        <Rows
          rows={[
            ["NPWP", employee.npwp ? formatNpwp(employee.npwp) : null],
            ["BPJS Ketenagakerjaan", employee.bpjsTkNo],
            ["BPJS Kesehatan", employee.bpjsKesNo],
          ]}
        />
      </Section>

      <Section title="Kontak Darurat">
        <Rows
          rows={[
            ["Nama", employee.emergencyName],
            ["Hubungan", employee.emergencyRelation],
            ["Nomor HP", employee.emergencyPhone ? formatPhone(employee.emergencyPhone) : null],
          ]}
        />
      </Section>

      <Section title="Keluarga">
        {documents.family.length === 0 ? (
          <p className="text-sm">—</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-black/70">
                <th className="py-1 font-medium">Hubungan</th>
                <th className="py-1 font-medium">Nama</th>
                <th className="py-1 font-medium">NIK</th>
                <th className="py-1 font-medium">Tanggal lahir</th>
              </tr>
            </thead>
            <tbody>
              {documents.family.map((m) => (
                <tr key={m.id}>
                  <td className="py-1">{FAMILY_RELATION_LABEL[m.relation]}</td>
                  <td className="py-1 font-medium">{m.fullName}</td>
                  <td className="py-1">{m.nik ?? "—"}</td>
                  <td className="py-1">{date(m.birthDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Kelengkapan Dokumen (${documents.completeness.percent}%)`}>
        <ul className="grid grid-cols-2 gap-x-6 text-sm">
          {(["KTP", "KK", "NPWP", "PAS_FOTO", "BPJS_TK", "BPJS_KES", "IJAZAH_TRANSKRIP", "SKCK", "SIM"] as const).map((type) => (
            <li key={type} className="py-0.5">
              {uploaded.has(type) ? "☑" : "☐"} {DOCUMENT_TYPE_LABEL[type]}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Sertifikat & Ijazah">
        {certificates.length === 0 ? (
          <p className="text-sm">—</p>
        ) : (
          <ul className="text-sm">
            {certificates.map((c) => (
              <li key={c.id} className="py-0.5">
                <span className="font-medium">{c.name}</span> · {CERTIFICATE_TYPE_LABEL[c.type]}
                {c.issuer && ` · ${c.issuer}`} · diambil {date(c.startDate)}
                {c.endDate && ` · berlaku s/d ${date(c.endDate)}`}
                {c.verification === "APPROVED" ? " · terverifikasi" : " · belum terverifikasi"}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Aset yang Dipegang">
        {assets.filter((a) => !a.returnedDate).length === 0 ? (
          <p className="text-sm">—</p>
        ) : (
          <ul className="text-sm">
            {assets
              .filter((a) => !a.returnedDate)
              .map((a) => (
                <li key={a.id} className="py-0.5">
                  {a.name}
                  {a.serialNo && ` (SN ${a.serialNo})`} · diterima {date(a.receivedDate)}
                </li>
              ))}
          </ul>
        )}
      </Section>

      <footer className="mt-12 grid grid-cols-2 gap-12 text-center text-sm break-inside-avoid">
        <div>
          <p>Karyawan</p>
          <div className="mt-16 border-t border-black pt-1">{employee.fullName}</div>
        </div>
        <div>
          <p>HR</p>
          <div className="mt-16 border-t border-black pt-1">&nbsp;</div>
        </div>
      </footer>
    </>
  );
}
