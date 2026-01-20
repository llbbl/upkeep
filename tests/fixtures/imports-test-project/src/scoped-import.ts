// Scoped package imports
import { useQuery, useMutation } from "@tanstack/react-query";

export function useFetch() {
  return useQuery({ queryKey: ["data"], queryFn: () => fetch("/api") });
}

export function useSubmit() {
  return useMutation({ mutationFn: (data: unknown) => fetch("/api", { method: "POST", body: JSON.stringify(data) }) });
}
