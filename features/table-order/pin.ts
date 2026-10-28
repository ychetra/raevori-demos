import { pinStore } from "@/components/admin/pin";

/**
 * The owner-admin PIN is told only to the page that created the room, so the laptop keeps it in sessionStorage per room
 * to show "Owner admin · PIN 4821" after a reload (Kitchen, Shop Pulse).
 */
const pins = pinStore("ra-table-order-pin");
export const savePin = pins.save;
export const readPin = pins.read;
