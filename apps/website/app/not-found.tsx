import { Bot } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-white dark:bg-slate-950 py-24">
      <div className="max-w-md mx-auto px-4 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-violet-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/25">
          <Bot className="w-10 h-10 text-white" />
        </div>

        <p className="text-6xl font-extrabold bg-gradient-to-r from-blue-200 to-violet-200 bg-clip-text text-transparent mb-2">404</p>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
          This robot went off-script
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
          The page you are looking for does not exist, or your AI worker accidentally deleted it. Either way, let us get you back on track.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <ButtonLink href="/" size="md">
            Back to Home
          </ButtonLink>
          <ButtonLink href="/docs" variant="outline" size="md">
            View Docs
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

