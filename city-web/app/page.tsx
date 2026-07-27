import type { Metadata } from "next";
import CityExperience from "./CityExperience";

export const metadata: Metadata = {
  title: "永晝花庭",
  description: "你離開時，時間仍在這裡流動。",
};

export default function Home() {
  return <CityExperience />;
}
