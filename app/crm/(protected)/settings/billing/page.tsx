import { CreditCard, Phone } from 'lucide-react'

export default function BillingPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Billing</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
        Subscription and payment information.
      </p>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center space-y-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-900 mx-auto">
          <CreditCard className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Billing is managed centrally
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            Billing is managed centrally by Ebright OSC. Please contact your account manager
            for any subscription, invoicing, or payment-related enquiries.
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4 max-w-xs mx-auto">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
            <Phone className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Account Manager</p>
            <a
              href="mailto:support@ebright.my"
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              support@ebright.my
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
