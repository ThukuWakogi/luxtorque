export interface OpeningHours {
  [day: string]: {
    open: string | null;
    close: string | null;
  };
}
