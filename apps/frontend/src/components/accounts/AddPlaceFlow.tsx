import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bitcoin, Landmark, LucideIcon, TrendingUp, Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AmountInput } from '@/components/accounts/AmountInput';
import { Monogram } from '@/components/accounts/Monogram';
import { addAccount, addInstitution, deleteInstitution } from '@/api/accountsApi';
import { addValuation } from '@/api/assetsApi';
import { AccountView, invalidateAccountQueries } from '@/hooks/use-accounts';
import { accountTypeLabel, parseAmountInput, todayIso } from '@/lib/accounts';
import { Account } from '@/types/Account';
import { Institution } from '@/types/Institution';
import { cn } from '@/lib/utils';

export type PlaceKind = 'bank' | 'investing' | 'crypto' | 'other';

interface KindOption {
  kind: PlaceKind;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Institution type the API stores for a new bank / app of this kind (CreateInstitutionCommandValidator). */
  institutionType: string;
  defaultAccountType: string;
}

const KINDS: KindOption[] = [
  { kind: 'bank', icon: Landmark, title: 'Bank', description: 'Savings or checking, like BCA or Jago', institutionType: 'bank', defaultAccountType: 'savings' },
  { kind: 'investing', icon: TrendingUp, title: 'Investing app', description: 'Stocks or funds, like Bibit or Stockbit', institutionType: 'broker', defaultAccountType: 'brokerage' },
  { kind: 'crypto', icon: Bitcoin, title: 'Crypto', description: 'Exchange or wallet, like Binance', institutionType: 'crypto_exchange', defaultAccountType: 'wallet' },
  { kind: 'other', icon: Wallet, title: 'Something else', description: 'E-wallet, cash, marketplace balance', institutionType: 'other', defaultAccountType: 'wallet' },
];

// Account types the API accepts (CreateAccountCommandValidator).
const ACCOUNT_TYPES = ['savings', 'checking', 'brokerage', 'wallet', 'credit_card', 'loan'];

function kindForInstitutionType(type: string): PlaceKind {
  return KINDS.find(k => k.institutionType === type)?.kind ?? 'other';
}

const PILL =
  'inline-flex items-center justify-center rounded-full bg-foreground font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const TITLE = 'font-[family-name:var(--font-title)] text-[30px] font-normal leading-[1.1]';

interface AddPlaceFlowProps {
  institutions: Institution[];
  accounts: AccountView[];
  /** "Finish setup" passes the bank / app that has no account yet; the flow starts at step 2. */
  preset?: Institution;
  onDone?: () => void;
}

export const AddPlaceFlow = ({ institutions, accounts, preset, onDone }: AddPlaceFlowProps) => {
  const [step, setStep] = useState<1 | 2>(preset ? 2 : 1);
  const [pickedKind, setPickedKind] = useState<PlaceKind | null>(preset ? kindForInstitutionType(preset.type) : null);

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2].map(i => (
          <span key={i} className={cn('h-[3px] w-6 rounded-sm', i <= step ? 'bg-foreground' : 'bg-border')} />
        ))}
      </div>

      {step === 1 ? (
        <>
          <div className="text-center">
            <h2 className={TITLE}>Where does your money live?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Add one place to start. You can add the rest later.</p>
          </div>
          <div role="radiogroup" aria-label="Type of place" className="grid w-full max-w-[492px] grid-cols-1 gap-3 sm:grid-cols-2">
            {KINDS.map(k => {
              const selected = pickedKind === k.kind;
              return (
                <button
                  key={k.kind}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPickedKind(k.kind)}
                  onDoubleClick={() => { setPickedKind(k.kind); setStep(2); }}
                  className={cn(
                    'flex flex-col gap-3.5 rounded-2xl border bg-card p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-foreground/30',
                  )}
                >
                  <k.icon className="h-5 w-5" />
                  <span>
                    <span className="block text-sm font-medium">{k.title}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-muted-foreground">{k.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" disabled={!pickedKind} onClick={() => setStep(2)} className={cn(PILL, 'h-[42px] px-[22px] text-[13px]')}>
            Continue
          </button>
        </>
      ) : (
        <PlaceForm
          kind={KINDS.find(k => k.kind === pickedKind) ?? KINDS[0]}
          institutions={institutions}
          accounts={accounts}
          preset={preset}
          onBack={preset ? undefined : () => setStep(1)}
          onDone={onDone}
        />
      )}
    </div>
  );
};

interface PlaceFormProps {
  kind: KindOption;
  institutions: Institution[];
  accounts: AccountView[];
  preset?: Institution;
  onBack?: () => void;
  onDone?: () => void;
}

const PlaceForm = ({ kind, institutions, accounts, preset, onBack, onDone }: PlaceFormProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(preset?.name ?? '');
  const [accountType, setAccountType] = useState(kind.defaultAccountType);
  const [currency, setCurrency] = useState('IDR');
  const [balance, setBalance] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  // If a call fails part-way, a retry reuses what was already created instead of adding duplicates.
  const createdInstitution = useRef<Institution | null>(null);
  const createdAccount = useRef<Account | null>(null);

  const trimmed = name.trim();
  const match = preset ?? institutions.find(i => i.name.trim().toLowerCase() === trimmed.toLowerCase());
  const suggestions = useMemo(() => {
    if (preset || trimmed === '') return [];
    const q = trimmed.toLowerCase();
    return institutions
      .filter(i => i.name.toLowerCase().includes(q) && i.name.toLowerCase() !== q)
      .slice(0, 5);
  }, [institutions, preset, trimmed]);

  const amount = parseAmountInput(balance);
  const currencyValid = /^[A-Za-z]{3}$/.test(currency.trim());
  const errors = {
    name: trimmed === '' ? 'Give this place a name' : null,
    currency: currencyValid ? null : 'Use a 3-letter code, like IDR',
    balance: amount === null ? 'Enter today’s balance (0 is fine)' : null,
  };
  const valid = !errors.name && !errors.currency && !errors.balance;

  const instType = match?.type ?? kind.institutionType;

  const submit = useMutation({
    mutationFn: async () => {
      const ccy = currency.trim().toUpperCase();
      const value = amount ?? 0;
      const today = todayIso();
      const institution = match ?? createdInstitution.current ?? await addInstitution({
        name: trimmed,
        type: kind.institutionType,
        country: 'ID',
      });
      createdInstitution.current = institution;

      // One bank / app can hold several accounts; keep their names apart.
      const taken = accounts.some(a => a.institutionId === institution.id && a.name.trim().toLowerCase() === trimmed.toLowerCase());
      const account = createdAccount.current ?? await addAccount({
        institutionId: institution.id,
        name: taken ? `${trimmed} ${accountTypeLabel(accountType, institution.type)}` : trimmed,
        accountType,
        currency: ccy,
        openingBalance: value,
        openingDate: today,
      });
      createdAccount.current = account;

      await addValuation({
        subjectType: 'account',
        subjectId: account.id,
        valueNative: value,
        currency: ccy,
        fxRateToIdr: 1,
        valueIdr: value,
        source: 'manual',
        notes: 'Opening balance',
        valuedAt: new Date().toISOString(),
      });
    },
    onSettled: () => invalidateAccountQueries(queryClient),
    onSuccess: () => onDone?.(),
  });

  const removePreset = useMutation({
    mutationFn: () => deleteInstitution(preset!.id),
    onSuccess: () => {
      invalidateAccountQueries(queryClient);
      onDone?.();
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) submit.mutate();
  };

  const fieldError = (msg: string | null) => touched && msg ? <p className="text-xs text-destructive">{msg}</p> : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-[400px] flex-col gap-5">
      <div className="text-center">
        <h2 className={TITLE}>{preset ? `Finish setting up ${preset.name}` : `Add your ${kind.title.toLowerCase()}`}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Enter what’s in it today. You can change this later.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="place-name">Name</Label>
        <div className="relative">
          <Input
            id="place-name"
            value={name}
            onChange={e => { setName(e.target.value); createdInstitution.current = null; createdAccount.current = null; }}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            readOnly={!!preset}
            autoFocus={!preset}
            autoComplete="off"
            placeholder={kind.kind === 'bank' ? 'e.g. BCA' : kind.kind === 'investing' ? 'e.g. Bibit' : kind.kind === 'crypto' ? 'e.g. Binance' : 'e.g. GoPay'}
            aria-invalid={touched && !!errors.name}
            className="h-12 rounded-xl"
          />
          {nameFocused && suggestions.length > 0 && (
            <ul role="listbox" aria-label="Your banks and apps" className="absolute inset-x-0 top-full z-10 mt-1 rounded-xl border border-border bg-card p-1 shadow-md">
              {suggestions.map(i => (
                <li key={i.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    // mousedown, not click, so the choice lands before the input's blur hides the list
                    onMouseDown={e => { e.preventDefault(); setName(i.name); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary"
                  >
                    <Monogram name={i.name} logoUrl={i.logoUrl} className="h-6 w-6 text-[10px]" />
                    {i.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {match && !preset && <p className="text-xs text-muted-foreground">Adds an account to your existing {match.name}.</p>}
        {fieldError(errors.name)}
      </div>

      <div className="grid grid-cols-[1fr_120px] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="place-type">Type</Label>
          <Select value={accountType} onValueChange={setAccountType}>
            <SelectTrigger id="place-type" className="h-12 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map(t => (
                <SelectItem key={t} value={t}>{accountTypeLabel(t, instType)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="place-currency">Currency</Label>
          <Input
            id="place-currency"
            value={currency}
            onChange={e => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            aria-invalid={touched && !!errors.currency}
            className="font-data h-12 rounded-xl uppercase"
          />
        </div>
      </div>
      {fieldError(errors.currency)}

      <div className="flex flex-col gap-2">
        <Label htmlFor="place-balance">Balance today</Label>
        <AmountInput
          id="place-balance"
          value={balance}
          onChange={setBalance}
          currency={currencyValid ? currency.trim().toUpperCase() : 'IDR'}
          autoFocus={!!preset}
          invalid={touched && !!errors.balance}
        />
        {fieldError(errors.balance)}
      </div>

      {submit.error && <p className="text-xs text-destructive">Couldn’t add this place. Check your connection and try again.</p>}
      {removePreset.error && <p className="text-xs text-destructive">Couldn’t remove {preset?.name}. Try again.</p>}

      <div className={cn('flex items-center', onBack || preset ? 'justify-between' : 'justify-end')}>
        {preset && (
          <button
            type="button"
            onClick={() => removePreset.mutate()}
            disabled={removePreset.isPending}
            className="rounded-sm text-[13px] text-destructive hover:opacity-70 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {removePreset.isPending ? 'Removing…' : `Remove ${preset.name} instead`}
          </button>
        )}
        {onBack && (
          <button type="button" onClick={onBack} className="rounded-sm text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Back
          </button>
        )}
        <button type="submit" disabled={submit.isPending} className={cn(PILL, 'h-[42px] px-[22px] text-[13px]')}>
          {submit.isPending ? 'Adding…' : 'Add account'}
        </button>
      </div>
    </form>
  );
};
