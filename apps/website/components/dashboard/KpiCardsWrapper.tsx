"use client";
import dynamic from "next/dynamic";
// v2 — daily bars + top contributor
export default dynamic(() => import("./KpiCards"), { ssr: false });
