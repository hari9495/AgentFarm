'use client';

/**
 * Book-a-demo form — shared by both A/B layouts. Fields styled after 21st.dev
 * shadcn Input/Label/Textarea/Button (resolved to op tokens via the globals.css
 * @theme bridge, no radix dep). Time-slot picker, client-side validation, and an
 * inline confirmation panel on success (original page just flipped `submitted`).
 */

import { useState } from 'react';
import { Calendar, CheckCircle2, ArrowRight } from 'lucide-react';

const inputCls =
  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow';
const labelCls = 'mb-1.5 block text-sm font-medium text-foreground';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_SLOTS = ['9:00 AM ET', '10:00 AM ET', '11:00 AM ET', '1:00 PM ET', '2:00 PM ET', '3:00 PM ET', '4:00 PM ET'];

type Fields = 'name' | 'email' | 'company' | 'time' | 'message';
type Errors = Partial<Record<Fields, string>>;

export default function BookDemoForm() {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  function clearError(field: Fields) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const emailVal = String(data.get('email') ?? '').trim();
    const company = String(data.get('company') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();

    const err: Errors = {};
    if (!name) err.name = 'Please enter your name.';
    else if (name.length < 2) err.name = 'Name must be at least 2 characters.';
    else if (name.length > 80) err.name = 'Name must be under 80 characters.';
    if (!emailVal) err.email = 'Please enter your work email.';
    else if (!EMAIL_RE.test(emailVal)) err.email = 'Enter a valid email address.';
    else if (emailVal.length > 120) err.email = 'Email must be under 120 characters.';
    if (company.length > 120) err.company = 'Company must be under 120 characters.';
    if (!selectedTime) err.time = 'Please pick a preferred time.';
    if (message.length > 2000) err.message = 'Message must be under 2000 characters.';

    if (Object.keys(err).length > 0) {
      setErrors(err);
      const first = (['name', 'email', 'company', 'message'] as Fields[]).find((f) => err[f]);
      if (first) form.querySelector<HTMLElement>(`#bd-${first}`)?.focus();
      return;
    }
    setErrors({});
    setEmail(emailVal);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center rounded-2xl p-8 text-center" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--op-approved-soft, #e7f6ee)' }}>
          <CheckCircle2 className="h-7 w-7" style={{ color: 'var(--op-approved)' }} />
        </div>
        <h3 className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ letterSpacing: '-0.02em', color: 'var(--op-ink)' }}>You&apos;re confirmed</h3>
        <p className="mt-3 max-w-sm text-[15px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>
          We&apos;ve received your request and will send a calendar invite to <strong style={{ color: 'var(--op-ink)' }}>{email}</strong>
          {selectedTime && <> for <strong style={{ color: 'var(--op-ink)' }}>{selectedTime}</strong></>} within a few minutes.
        </p>
        <p className="mt-4 text-[13px]" style={{ color: 'var(--op-muted)' }}>Need to reschedule? Reply to the confirmation email.</p>
      </div>
    );
  }

  const fieldCls = (field: Fields) => `${inputCls} ${errors[field] ? 'border-[color:var(--op-blocked,#e1483d)] focus-visible:ring-[color:var(--op-blocked,#e1483d)]' : 'border-input'}`;
  const errText = (field: Fields) => errors[field] ? <p id={`bd-${field}-error`} className="mt-1.5 text-[12px]" style={{ color: 'var(--op-blocked, #e1483d)' }}>{errors[field]}</p> : null;
  const aria = (field: Fields) => ({ 'aria-invalid': errors[field] ? true : undefined, 'aria-describedby': errors[field] ? `bd-${field}-error` : undefined, onChange: () => clearError(field) });

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bd-name" className={labelCls}>Full name</label>
          <input type="text" id="bd-name" name="name" required maxLength={80} placeholder="Your name" className={fieldCls('name')} {...aria('name')} />
          {errText('name')}
        </div>
        <div>
          <label htmlFor="bd-email" className={labelCls}>Work email</label>
          <input type="email" id="bd-email" name="email" required maxLength={120} placeholder="you@company.com" className={fieldCls('email')} {...aria('email')} />
          {errText('email')}
        </div>
      </div>

      <div>
        <label htmlFor="bd-company" className={labelCls}>Company <span className="text-muted-foreground">(optional)</span></label>
        <input type="text" id="bd-company" name="company" maxLength={120} placeholder="Company name" className={fieldCls('company')} {...aria('company')} />
        {errText('company')}
      </div>

      <div>
        <label className={labelCls}><Calendar className="mr-1 inline h-3.5 w-3.5" />Preferred time (ET)</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {TIME_SLOTS.map((slot) => {
            const on = selectedTime === slot;
            return (
              <button key={slot} type="button" onClick={() => { setSelectedTime(slot); clearError('time'); }} className="rounded-full py-2 text-[13px] font-medium transition-colors"
                style={{ border: `1px solid ${on ? 'var(--op-indigo)' : 'var(--op-line)'}`, background: on ? 'var(--op-indigo-soft)' : 'var(--op-paper-2)', color: on ? 'var(--op-indigo)' : 'var(--op-muted)' }}>
                {slot}
              </button>
            );
          })}
        </div>
        {errText('time')}
      </div>

      <div>
        <label htmlFor="bd-message" className={labelCls}>What would you like to explore? <span className="text-muted-foreground">(optional)</span></label>
        <textarea id="bd-message" name="message" maxLength={2000} rows={3} placeholder="Tell us what you'd like to see..." className={`${fieldCls('message')} min-h-[92px] resize-none`} {...aria('message')} />
        {errText('message')}
      </div>

      <button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
        Book my session <ArrowRight className="h-4 w-4" />
      </button>
      <p className="text-center text-[12px]" style={{ color: 'var(--op-muted)' }}>We&apos;ll confirm with a calendar invite within minutes.</p>
    </form>
  );
}
