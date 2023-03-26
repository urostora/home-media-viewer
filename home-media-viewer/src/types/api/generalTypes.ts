export interface GeneralSearchType {
    id?: string,
    take?: number,
    skip?: number,
}

export interface IdSearchType extends GeneralSearchType {
    id?: string,
}

export interface StatusSearchType extends IdSearchType {
    status?: Status,
}

export enum Status {
    Active,
    Deleted,
    Disabled,
}
