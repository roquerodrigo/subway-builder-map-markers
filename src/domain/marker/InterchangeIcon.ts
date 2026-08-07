import { INTERCHANGE_ICON, STATION_ICON } from '@/domain/marker/MarkerIconSet'

// A marker on two lines is an interchange, and it should look like one without the
// player having to say so. Only these two icons are traded for each other: any other
// icon is a choice the player made, and choices are kept.
export function iconForMembership(icon: string, folderCount: number): string {
  if (icon !== STATION_ICON && icon !== INTERCHANGE_ICON) {
    return icon
  }

  return folderCount >= 2 ? INTERCHANGE_ICON : STATION_ICON
}
