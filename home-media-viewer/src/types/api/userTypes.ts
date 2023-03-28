import { Status } from "@prisma/client"
import type { EditEntityWithStatusType, StatusSearchType, EntityWithStatusType } from "./generalTypes"

export interface UserSearchType extends StatusSearchType {
    name?: string,
    email?: string,
}

export interface UserAddType {
    name: string,
    email: string,
    password: string,
}

export interface UserEditType extends EditEntityWithStatusType {
    name?: string,
    email?: string,
    password?: string,
}

export interface UserDataType extends EntityWithStatusType {
    name: string,
    email: string,
}
