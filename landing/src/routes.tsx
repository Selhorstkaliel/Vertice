import type { RouteObject } from "react-router";
import { ROUTES } from "@/lib/routes";
import { Layout } from "@/components/layout/Layout";
import { HomePage } from "@/pages/HomePage";
import ResourcesPage from "@/pages/ResourcesPage";
import PlansPage from "@/pages/PlansPage";
import ContestsPage from "@/pages/ContestsPage";
import AccessPage from "@/pages/AccessPage";
import InfoPage from "@/pages/InfoPage";
import NotFoundPage from "@/pages/NotFoundPage";

/**
 * Rotas em um módulo próprio, com importação direta: as páginas são pré-renderizadas no build
 * e hidratadas em seguida, então carregá-las sob demanda só atrasaria a hidratação.
 */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: ROUTES.home, element: <HomePage /> },
      { path: ROUTES.features, element: <ResourcesPage /> },
      { path: ROUTES.plans, element: <PlansPage /> },
      { path: ROUTES.contests, element: <ContestsPage /> },
      { path: ROUTES.login, element: <AccessPage kind="login" /> },
      { path: ROUTES.signup, element: <AccessPage kind="signup" /> },
      { path: ROUTES.dashboard, element: <AccessPage kind="dashboard" /> },
      { path: ROUTES.about, element: <InfoPage kind="about" /> },
      { path: ROUTES.contact, element: <InfoPage kind="contact" /> },
      { path: ROUTES.terms, element: <InfoPage kind="terms" /> },
      { path: ROUTES.privacy, element: <InfoPage kind="privacy" /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
