"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
    theme: "light",
    toggle: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("light");

    useEffect(() => {
        // Read the class already applied by the FOUC-prevention inline script
        const initial: Theme = document.documentElement.classList.contains("dark")
            ? "dark"
            : "light";
        setTheme(initial);
    }, []);

    const toggle = useCallback(() => {
        setTheme((prev) => {
            const next = prev === "light" ? "dark" : "light";
            document.documentElement.classList.toggle("dark", next === "dark");
            localStorage.setItem("agentfarm-theme", next);
            return next;
        });
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

