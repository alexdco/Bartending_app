export function alcoholicStatusLabel(status: string): string {
  switch (status) {
    case "alcoholic":
      return "Alcoholic";
    case "non_alcoholic":
      return "Non alcoholic";
    case "optional":
      return "Optional alcohol";
    default:
      return "Unknown";
  }
}
