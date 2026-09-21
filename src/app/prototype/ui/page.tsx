import { notFound } from "next/navigation";
import { UiPrototype } from "./prototype";
import "./prototype.css";

export default function PrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiPrototype />;
}
