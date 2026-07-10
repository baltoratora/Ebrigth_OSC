import { useContext } from "react";
import { EditionContext } from "@/app/components/annual-showcase/EditionContext";

export function useActiveEdition() {
  const ctx = useContext(EditionContext);
  if (!ctx) throw new Error("useActiveEdition must be used within EditionProvider");
  return ctx;
}
