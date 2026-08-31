'use client';

/**
 * Contact form fields styled after 21st.dev `meschacirung/contact-form`
 * (shadcn Input/Label/Textarea/Button) — the shadcn utility classes resolve to
 * the Operations Console palette via the @theme bridge in globals.css, so this
 * needs no radix/cva dependency. Submit logic (POST /api/contact) is unchanged.
 * Client-side validation runs on submit and clears per-field as the user types.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';

const inputCls =
  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow';
const labelCls = 'mb-1.5 block text-sm font-medium text-foreground';

// eslint-disable-next-line no-control-regex
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Fields = 'name' | 'email' | 'company' | 'message';
type Errors = Partial<Record<Fields, string>>;

function validate(v: Record<Fields, string>): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  if (!name) e.name = 'Please enter your name.';
  else if (name.length < 2) e.name = 'Name must be at least 2 characters.';
  else if (name.length > 80) e.name = 'Name must be under 80 characters.';

  const email = v.email.trim();
  if (!email) e.email = 'Please enter your email.';
  else if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address.';
  else if (email.length > 120) e.email = 'Email must be under 120 characters.';

  if (v.company.trim().length > 120) e.company = 'Company must be under 120 characters.';

  const message = v.message.trim();
  if (!message) e.message = 'Please enter a message.';
  else if (message.length < 10) e.message = 'Message must be at least 10 characters.';
  else if (message.length > 2000) e.message = 'Message must be under 2000 characters.';

  return e;
}

export default function ContactForm() {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  function clearError(field: Fields) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const values = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      company: String(data.get('company') ?? ''),
      message: String(data.get('message') ?? ''),
    };

    const found = validate(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const first = (['name', 'email', 'company', 'message'] as Fields[]).find((f) => found[f]);
      if (first) form.querySelector<HTMLElement>(`#${first}`)?.focus();
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          company: values.company.trim(),
          message: values.message.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Message sent! We'll reply within 1 business day.");
      form.reset();
    } catch {
      toast.error('Failed to send. Please email us directly at hello@agentfarms.in');
    } finally {
      setLoading(false);
    }
  }

  const fieldCls = (field: Fields) =>
    `${inputCls} ${errors[field] ? 'border-[color:var(--op-blocked,#e1483d)] focus-visible:ring-[color:var(--op-blocked,#e1483d)]' : 'border-input'}`;

  const errText = (field: Fields) =>
    errors[field] ? (
      <p id={`${field}-error`} className="mt-1.5 text-[12px]" style={{ color: 'var(--op-blocked, #e1483d)' }}>{errors[field]}</p>
    ) : null;

  const aria = (field: Fields) => ({
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
    onChange: () => clearError(field),
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelCls}>Name</label>
          <input type="text" id="name" name="name" required maxLength={80} placeholder="Your name" className={fieldCls('name')} {...aria('name')} />
          {errText('name')}
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input type="email" id="email" name="email" required maxLength={120} placeholder="you@company.com" className={fieldCls('email')} {...aria('email')} />
          {errText('email')}
        </div>
      </div>

      <div>
        <label htmlFor="company" className={labelCls}>Company <span className="text-muted-foreground">(optional)</span></label>
        <input type="text" id="company" name="company" maxLength={120} placeholder="Company name" className={fieldCls('company')} {...aria('company')} />
        {errText('company')}
      </div>

      <div>
        <label htmlFor="message" className={labelCls}>Message</label>
        <textarea id="message" name="message" required minLength={10} maxLength={2000} rows={5} placeholder="Tell us about your team and what you're trying to build..." className={`${fieldCls('message')} min-h-[120px] resize-none`} {...aria('message')} />
        {errText('message')}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  );
}
