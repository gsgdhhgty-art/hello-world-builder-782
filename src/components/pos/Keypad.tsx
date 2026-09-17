import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Large touch keypad used for amounts and quantities. */
export function Keypad({
  value,
  onChange,
  onConfirm,
  confirmLabel = "تأكيد",
  confirmDisabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}) {
  function press(key: string) {
    if (key === ".") {
      if (value.includes(".")) return;
      onChange((value || "0") + ".");
      return;
    }
    onChange(value === "0" ? key : value + key);
  }

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "00", "0", "."];

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <Button
          key={k}
          type="button"
          variant="secondary"
          className="h-14 text-xl font-bold"
          onClick={() => press(k)}
        >
          {k}
        </Button>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-14 text-base font-bold"
        onClick={() => onChange("")}
      >
        مسح
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-14"
        onClick={() => onChange(value.slice(0, -1))}
      >
        <Delete className="size-5" />
      </Button>
      <Button
        type="button"
        className="h-14 text-base font-bold"
        disabled={confirmDisabled}
        onClick={() => onConfirm?.()}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}
