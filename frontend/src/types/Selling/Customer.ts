import { AllowedToTransactWith } from '../Accounts/AllowedToTransactWith'
import { CustomerCreditLimit } from './CustomerCreditLimit'
import { PartyAccount } from '../Accounts/PartyAccount'
import { SalesTeam } from './SalesTeam'
import { PortalUser } from '../Utilities/PortalUser'

export interface Customer{
	name: string
	creation: string
	modified: string
	owner: string
	modified_by: string
	docstatus: 0 | 1 | 2
	parent?: string
	parentfield?: string
	parenttype?: string
	idx?: number
	/**	Series : Select	*/
	naming_series?: "CUST-.YYYY.-"
	/**	Salutation : Link - Salutation	*/
	salutation?: string
	/**	Customer Name : Data	*/
	customer_name: string
	/**	Customer Type : Select	*/
	customer_type: "Company" | "Individual" | "Partnership"
	/**	Customer Group : Link - Customer Group	*/
	customer_group?: string
	/**	Territory : Link - Territory	*/
	territory?: string
	/**	Gender : Link - Gender	*/
	gender?: string
	/**	From Lead : Link - Lead	*/
	lead_name?: string
	/**	From Opportunity : Link - Opportunity	*/
	opportunity_name?: string
	/**	From Prospect : Link - Prospect	*/
	prospect_name?: string
	/**	Account Manager : Link - User	*/
	account_manager?: string
	/**	Image : Attach Image	*/
	image?: string
	/**	Billing Currency : Link - Currency	*/
	default_currency?: string
	/**	Default Company Bank Account : Link - Bank Account	*/
	default_bank_account?: string
	/**	Default Price List : Link - Price List	*/
	default_price_list?: string
	/**	Is Internal Customer : Check	*/
	is_internal_customer?: 0 | 1
	/**	Represents Company : Link - Company	*/
	represents_company?: string
	/**	Allowed To Transact With : Table - Allowed To Transact With	*/
	companies?: AllowedToTransactWith[]
	/**	Market Segment : Link - Market Segment	*/
	market_segment?: string
	/**	Industry : Link - Industry Type	*/
	industry?: string
	/**	Customer POS id : Data	*/
	customer_pos_id?: string
	/**	Website : Data	*/
	website?: string
	/**	Print Language : Link - Language	*/
	language?: string
	/**	Customer Details : Text - Additional information regarding the customer.	*/
	customer_details?: string
	/**	Customer Primary Address : Link - Address - Reselect, if the chosen address is edited after save	*/
	customer_primary_address?: string
	/**	Primary Address : Text	*/
	primary_address?: string
	/**	Customer Primary Contact : Link - Contact - Reselect, if the chosen contact is edited after save	*/
	customer_primary_contact?: string
	/**	Mobile No : Read Only	*/
	mobile_no?: string
	/**	Email Id : Read Only	*/
	email_id?: string
	/**	First Name : Read Only	*/
	first_name?: string
	/**	Last Name : Read Only	*/
	last_name?: string
	/**	Tax ID : Data	*/
	tax_id?: string
	/**	Tax Category : Link - Tax Category	*/
	tax_category?: string
	/**	Tax Withholding Category : Link - Tax Withholding Category	*/
	tax_withholding_category?: string
	/**	Default Payment Terms Template : Link - Payment Terms Template	*/
	payment_terms?: string
	/**	Credit Limit : Table - Customer Credit Limit	*/
	credit_limits?: CustomerCreditLimit[]
	/**	Accounts : Table - Party Account - Mention if non-standard Receivable account	*/
	accounts?: PartyAccount[]
	/**	Loyalty Program : Link - Loyalty Program	*/
	loyalty_program?: string
	/**	Loyalty Program Tier : Data	*/
	loyalty_program_tier?: string
	/**	Sales Team : Table - Sales Team	*/
	sales_team?: SalesTeam[]
	/**	Sales Partner : Link - Sales Partner	*/
	default_sales_partner?: string
	/**	Commission Rate : Float	*/
	default_commission_rate?: number
	/**	Allow Sales Invoice Creation Without Sales Order : Check	*/
	so_required?: 0 | 1
	/**	Allow Sales Invoice Creation Without Delivery Note : Check	*/
	dn_required?: 0 | 1
	/**	Is Frozen : Check	*/
	is_frozen?: 0 | 1
	/**	Disabled : Check	*/
	disabled?: 0 | 1
	/**	Customer Portal Users : Table - Portal User	*/
	portal_users?: PortalUser[]
}