import type { StatusSearchType } from "./generalTypes"

export interface UserSearchType extends StatusSearchType {
    name?: string,
    email?: string,
}