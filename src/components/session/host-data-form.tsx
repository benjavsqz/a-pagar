'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { formatRut } from '@/lib/utils'

const BANKS = [
  'Banco Estado', 'Banco de Chile', 'BCI', 'Santander', 'BBVA', 'Itaú',
  'Scotiabank', 'Banco Security', 'BICE', 'Banco Consorcio', 'Banco Internacional',
  'Falabella', 'Banco Ripley', 'Coopeuch', 'Mercado Pago', 'MACH', 'Tenpo', 'Otro',
].map(b => ({ value: b, label: b }))

const ACCOUNT_TYPES = [
  { value: 'Cuenta Corriente', label: 'Cuenta Corriente' },
  { value: 'Cuenta Vista', label: 'Cuenta Vista' },
  { value: 'Cuenta RUT', label: 'Cuenta RUT (BancoEstado)' },
  { value: 'Cuenta de Ahorro', label: 'Cuenta de Ahorro' },
  { value: 'Cuenta Digital', label: 'Cuenta Digital (MACH, Mercado Pago…)' },
  { value: 'Otro', label: 'Otro' },
]

export function HostDataForm({
  hostName, setHostName,
  hostBank, setHostBank,
  hostAccountType, setHostAccountType,
  hostAccount, setHostAccount,
  hostRut, setHostRut,
  hostEmail, setHostEmail,
  hostPaymentLink, setHostPaymentLink,
  loading, onSubmit, submitLabel, hint,
}: {
  hostName: string; setHostName: (v: string) => void
  hostBank: string; setHostBank: (v: string) => void
  hostAccountType: string; setHostAccountType: (v: string) => void
  hostAccount: string; setHostAccount: (v: string) => void
  hostRut: string; setHostRut: (v: string) => void
  hostEmail: string; setHostEmail: (v: string) => void
  hostPaymentLink: string; setHostPaymentLink: (v: string) => void
  loading: boolean
  onSubmit: () => void
  submitLabel: string
  hint?: string
}) {
  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-8">
      <p className="text-sm text-[#6b5f55] leading-relaxed">
        {hint ?? 'Tus datos de transferencia aparecerán para que los demás sepan a dónde pagarte.'}
        {' '}<span className="text-[#8a7d71]">Los campos con * son obligatorios.</span>
      </p>

      <Input
        label="Tu nombre *"
        placeholder="Ej: Benja, Cami..."
        value={hostName}
        onChange={e => setHostName(e.target.value)}
      />

      <p className="text-xs font-semibold text-[#6b5f55] uppercase tracking-wider pt-1">Para que te transfieran</p>

      <SelectField
        label="Banco"
        value={hostBank}
        onChange={setHostBank}
        placeholder="Selecciona tu banco"
        options={BANKS}
      />

      <SelectField
        label="Tipo de cuenta"
        value={hostAccountType}
        onChange={setHostAccountType}
        placeholder="Selecciona el tipo"
        options={ACCOUNT_TYPES}
      />

      <Input
        label="Nro de cuenta"
        placeholder="Ej: 19438685"
        value={hostAccount}
        onChange={e => setHostAccount(e.target.value)}
        inputMode="numeric"
      />

      <Input
        label="RUT"
        placeholder="12.345.678-9"
        value={hostRut}
        onChange={e => setHostRut(formatRut(e.target.value))}
        inputMode="numeric"
      />

      <Input
        label="Correo (opcional)"
        placeholder="tucorreo@ejemplo.cl"
        value={hostEmail}
        onChange={e => setHostEmail(e.target.value)}
        type="email"
        inputMode="email"
      />

      <div>
        <Input
          label="Link de pago (opcional)"
          placeholder="Mercado Pago, MACH, Fintoc, tu alias…"
          value={hostPaymentLink}
          onChange={e => setHostPaymentLink(e.target.value)}
          inputMode="url"
        />
        <p className="text-xs text-[#9a8d82] mt-1.5 px-0.5">
          Si lo pegas, los demás verán un botón “Pagar ahora” que lo abre directo. Igual mostramos tus datos para transferir desde cualquier banco.
        </p>
      </div>

      <Button fullWidth loading={loading} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </div>
  )
}
