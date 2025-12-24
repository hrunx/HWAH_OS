"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@pa-os/ui";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster />
    </ThemeProvider>
  );
}


