import { pinStore } from "@/components/admin/pin";

/**
 * The salon admin's PIN is told only to the calendar page that created the room, so that page keeps it in
 * sessionStorage per room to show "Owner admin · PIN 4821" after a reload.
 */
const pins = pinStore("ra-booking-pin");
export const savePin = pins.save;
export const readPin = pins.read;
