// SPDX-License-Identifier: Apache-2.0
import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { M3ThemeProvider } from "@aphrody/m3-theme/react";
import { createAppRouter } from "./router";

/** One app for the whole repository: M3 theme, TanStack Query for data and TanStack Router for every surface. */
export const App: React.FC = () => {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 600_000 } } }));
  const [router] = useState(() => createAppRouter(queryClient));
  return (
    <M3ThemeProvider defaultSeedColor="#3186ff" defaultThemeMode="dark">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </M3ThemeProvider>
  );
};
