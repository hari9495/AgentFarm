import type { Metadata } from "next";
import {
    Activity,
    Code2,
    GitBranch,
    Layout,
    Server,
    Shield,
    Sparkles,
    TestTube2,
    Zap,
    CheckCircle2,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import ProductSceneSection from "@/components/product/ProductSceneSection";
import ProductDemoVideo from "@/components/product/ProductDemoVideo";
import { productPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: productPageContent.metadata.title,
    description: productPageContent.metadata.description,
};

const features = [
    { icon: Code2, ...productPageContent.features[0] },
    { icon: Zap, ...productPageContent.features[1] },
    { icon: Shield, ...productPageContent.features[2] },
    { icon: Server, ...productPageContent.features[3] },
    { icon: TestTube2, ...productPageContent.features[4] },
    { icon: Activity, ...productPageContent.features[5] },
    { icon: GitBranch, ...productPageContent.features[6] },
    { icon: Layout, ...productPageContent.features[7] },
];

export default function ProductPage() {
    return (
        <div>
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1800&q=80"
                    alt="AgentFarm product dashboard showing governed AI workers in action"
                    className="h-[440px] w-full object-cover sm:h-[540px]"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/90 via-[#07080a]/60 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="max-w-2xl">
                            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-violet-300 backdrop-blur">
                                <Sparkles className="h-3.5 w-3.5" />
                                {productPageContent.hero.badge}
                            </span>
                            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
                                {productPageContent.hero.titleLead}{" "}
                                <span className="bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
                                    {productPageContent.hero.titleAccent}
                                </span>
                            </h1>
                            <p className="mt-5 text-xl leading-relaxed text-slate-300">
                                {productPageContent.hero.description}
                            </p>
                            <div className="mt-8 flex flex-wrap gap-4">
                                <ButtonLink href={productPageContent.hero.primaryCta.href} size="lg">
                                    {productPageContent.hero.primaryCta.label}
                                </ButtonLink>
                                <ButtonLink href={productPageContent.hero.secondaryCta.href} variant="outline" size="lg">
                                    {productPageContent.hero.secondaryCta.label}
                                </ButtonLink>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-b border-[var(--hairline)] bg-[var(--surface)] py-10">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        {productPageContent.outcomes.map((outcome) => (
                            <div key={outcome} className="flex items-start gap-3">
                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-green)]" />
                                <p className="text-sm leading-snug text-[var(--body-color)]">{outcome}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="py-14 sm:py-16">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="rounded-3xl border border-[var(--hairline)] bg-[var(--surface-card)] px-5 py-6 sm:px-8 sm:py-8">
                        <p className="chip chip-accent">Execution path</p>
                        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-3xl">
                            From role selection to trusted delivery in three steps
                        </h2>
                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            {productPageContent.executionFlow.map((item) => (
                                <article key={item.step} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-el)] p-4">
                                    <p className="text-xs font-semibold tracking-[0.14em] text-[var(--ash)]">STEP {item.step}</p>
                                    <h3 className="mt-2 text-base font-semibold text-[var(--ink)]">{item.title}</h3>
                                    <p className="mt-2 text-sm text-[var(--body-color)]">{item.detail}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <ProductSceneSection />

            <section className="bg-[var(--surface)] py-20">
                <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
                    <p className="chip chip-accent mb-4">{productPageContent.demo.badge}</p>
                    <h2 className="mb-4 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-3xl">
                        {productPageContent.demo.title}
                    </h2>
                    <p className="mx-auto mb-8 max-w-xl text-base text-[var(--mute)]">
                        {productPageContent.demo.description}
                    </p>
                    <ProductDemoVideo />
                </div>
            </section>

            <section className="py-24">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="mx-auto mb-16 max-w-2xl text-center">
                        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-4xl">
                            {productPageContent.featuresHeader.title}
                        </h2>
                        <p className="mt-4 text-lg text-[var(--mute)]">
                            {productPageContent.featuresHeader.description}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                        {features.map(({ icon: Icon, gradient, title, description, image }) => (
                            <div
                                key={title}
                                className="group overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] transition-all hover:-translate-y-1 hover:border-[var(--accent-blue)]/40"
                            >
                                <div className="relative h-36 overflow-hidden">
                                    <img
                                        src={image}
                                        alt={title}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#07080a]/70 to-transparent" />
                                    <div className="absolute bottom-3 left-3">
                                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${gradient}`}>
                                            <Icon className="h-5 w-5 text-white" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5">
                                    <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">{title}</h3>
                                    <p className="text-xs leading-relaxed text-[var(--mute)]">{description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="py-20">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="relative overflow-hidden rounded-3xl">
                        <img
                            src="https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=1800&q=80"
                            alt="Team building software together"
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-br from-[#07080a]/90 via-[#07080a]/90 to-[#07080a]/90" />
                        <div className="relative px-10 py-16 text-center text-white">
                            <h2 className="mb-4 text-3xl font-bold">{productPageContent.cta.title}</h2>
                            <p className="mx-auto mb-8 max-w-md text-[var(--mute)]">{productPageContent.cta.description}</p>
                            <ButtonLink href={productPageContent.cta.button.href} size="lg">
                                {productPageContent.cta.button.label}
                            </ButtonLink>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
