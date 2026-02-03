
export interface CRMNote{
	name: number
	creation: string
	modified: string
	owner: string
	modified_by: string
	docstatus: 0 | 1 | 2
	parent?: string
	parentfield?: string
	parenttype?: string
	idx?: number
	/**	Note : Text Editor	*/
	note?: string
	/**	Added By : Link - User	*/
	added_by?: string
	/**	Added On : Datetime	*/
	added_on?: string
}