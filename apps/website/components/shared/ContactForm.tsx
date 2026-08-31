'use client';

/**
 * Contact form fields styled after 21st.dev `meschacirung/contact-form`
 * (shadcn Input/Label/Textarea/Button) — the shadcn utility classes resolve to
 * the Operations Console palette via the @theme bridge in globals.css, so this
 * needs no radix/cva dependency. Submit logic (POST /api/contact) is unchanged.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';

const inputCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow';
const labelCls = 'mb-1.5 block text-sm font-medium text-foreground';

export default function ContactForm() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          company: data.get('company'),
          message: data.get('message'),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelCls}>Name</label>
          <input type="text" id="name" name="name" required placeholder="Your name" className={inputCls} />
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input type="email" id="email" name="email" required placeholder="you@company.com" className={inputCls} />
        </div>
      </div>

      <div>
        <label htmlFor="company" className={labelCls}>Company <span className="text-muted-foreground">(optional)</span></label>
        <input type="text" id="company" name="company" placeholder="Company name" className={inputCls} />
      </div>

      <div>
        <label htmlFor="message" className={labelCls}>Message</label>
        <textarea id="message" name="message" required rows={5} placeholder="Tell us about your team and what you're trying to build..." className={`${inputCls} min-h-[120px] resize-none`} />
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
