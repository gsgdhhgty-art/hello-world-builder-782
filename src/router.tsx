import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // networkMode: "always" ضروري لتطبيق يعمل بدون إنترنت: لا نُوقف الطلبات المحلية
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { networkMode: "always", retry: 1 },
      mutations: { networkMode: "always" },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
