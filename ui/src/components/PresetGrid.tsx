import PresetTile, { type PresetData } from "./PresetTile";

interface Props {
  presets: PresetData[];
  activeId: string;
  isOn: boolean;
  isCustom: boolean;
  onSelect: (id: string) => void;
}

export default function PresetGrid({
  presets,
  activeId,
  isOn,
  isCustom,
  onSelect,
}: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        animation: "fadeIn 0.6s ease both 0.1s",
      }}
    >
      {presets.map((p) => (
        <PresetTile
          key={p.id}
          preset={p}
          isActive={!isCustom && activeId === p.id}
          isOn={isOn}
          onTap={onSelect}
        />
      ))}
    </div>
  );
}
