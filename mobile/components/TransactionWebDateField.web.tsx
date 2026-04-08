import React from "react";
import type { TransactionWebDateFieldProps } from "./transactionWebDateField.types";

export function TransactionWebDateField({
  value,
  max,
  onChange,
  textColor,
  outlineColor,
  backgroundColor,
}: TransactionWebDateFieldProps) {
  return (
    <input
      type="date"
      value={value}
      max={max}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        if (v) onChange(v);
      }}
      style={{
        width: "100%",
        fontSize: 16,
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${outlineColor}`,
        color: textColor,
        backgroundColor,
        boxSizing: "border-box",
      }}
    />
  );
}
