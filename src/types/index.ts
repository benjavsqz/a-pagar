export type SessionStatus = 'open' | 'closed'
export type SplitMode = 'items' | 'equal'

export interface Session {
  id: string
  host_id: string | null
  restaurant_name: string | null
  status: SessionStatus
  propina_pct: number // 0 or 10
  host_name: string
  host_bank: string | null
  host_account: string | null
  host_rut: string | null
  host_email: string | null // correo del host (la transferencia avisa al correo)
  host_payment_link: string | null // link opcional de pago (MP, MACH, Fintoc…)
  created_at: string
  split_mode: SplitMode
  split_total: number | null  // equal-split: total amount
  split_n: number | null      // equal-split: expected participant count (including host)
}

export interface Item {
  id: string
  session_id: string
  name: string
  price: number
  position: number
}

export interface Participant {
  id: string
  session_id: string
  name: string
  created_at: string
  is_host?: boolean // true para el participante "anfitrión" (marca su consumo, no se cobra)
}

export interface Claim {
  id: string
  item_id: string
  participant_id: string
  created_at: string
}

export interface Payment {
  id: string
  session_id: string
  participant_id: string
  amount: number
  comprobante_url: string | null
  confirmed_by_host: boolean
  paid_at: string | null
  created_at: string
}

// Computed / view types
export interface ItemWithClaims extends Item {
  claims: Claim[]
  price_per_person: number
}

export interface ParticipantSummary {
  participant: Participant
  items: ItemWithClaims[]
  subtotal: number
  propina: number
  total: number
  payment: Payment | null
}

export interface SessionWithData {
  session: Session
  items: Item[]
  participants: Participant[]
  claims: Claim[]
  payments: Payment[]
}
