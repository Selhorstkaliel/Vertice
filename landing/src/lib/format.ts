const number = new Intl.NumberFormat("pt-BR");

export const formatNumber = (value: number, decimals = 0) =>
  decimals ? value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : number.format(value);

export const formatMinutes = (total: number) => {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`;
};
