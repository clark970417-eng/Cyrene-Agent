import type { ReactNode } from "react";
import { useChatAppearance } from "../../hooks/useChatAppearance";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  useChatAppearance();
  return <FeedbackProvider>{children}</FeedbackProvider>;
}
