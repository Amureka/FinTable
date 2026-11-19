import { InputNumber, InputNumberProps } from "antd";

const groupFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

// Поле для сумм в рублях: целые числа, разряды разделены пробелами при вводе и показе.
// Значение, которое получает форма, остаётся обычным числом.
export default function MoneyInput(props: InputNumberProps<number>) {
  return (
    <InputNumber<number>
      precision={0}
      addonAfter="₽"
      formatter={value => (value === undefined || value === null ? "" : groupFormatter.format(Number(value)))}
      parser={value => (value ?? "").replace(/[\s  ]/g, "") as unknown as number}
      {...props}
    />
  );
}
