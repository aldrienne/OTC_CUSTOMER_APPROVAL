/**
 * @NApiVersion 2.1
 */
define([],

    () => {

        const BODY_FIELDS_TO_TRACK = [
            'creditlimit', 'terms', 'currency', 'companyname', 'accountnumber',
            'email', 'entityid', 'defaultbankaccount', 'defaulttaxreg', 'taxable',
            'taxitem', 'vatregnumber'
        ]

        const SUBRECORDS_TO_TRACK = {
            addressbook: {
                addressbookaddress: [
                    'addr1', 'addr2', 'addr3', 'city', 'state', 'zip', 'country',
                    'defaultbilling', 'defaultshipping', 'isresidential', 'attention','custrecord_ava_customergstin'
                ]
            }
        }

        const SUBLISTS_TO_TRACK = {
            addressbook: {
              subrecords: {
                addressbookaddress: [
                  'addr1', 'addr2', 'addr3', 'city', 'state', 'zip', 'country'
                ]
              },
              sublistFields: [
                'defaultbilling', 'defaultshipping', 'isresidential', 'attention', 'custrecord_ava_customergstin'
              ]
            },
            currency: {
                sublistFields: [
                    'currency'
                ]
            }
        }


        const ENTITY_FIELDS = {
            LOA_APPROVER_ROLE: "custentity_tsc_loa_approver_roles",
            LOA_APPROVER_BRAND: "custentity_tsc_loa_approver_brand",
            LOA_OTC_APPROVAL_STATUS: "custentity_tsc_loa_approval_status",
            LOA_OTC_PENDING_CHANGES: "custentity_tsc_cust_pending_changes_json",
            BRAND: "custentity_brand"
        }

        const LIST_LOA_ROLES = {
            ID: "customlist_tsc_loa_approver_roles",
            VALUE: {
                FINANCIAL_CONTROLLER: 1,
                VP_SALES: 2,
                BU_PRESIDENT: 3,
                SALES_MANAGER: 4,
                SALES_DIRECTOR: 5,
                SMF_CEO: 6,
                SANDVIK_CEO: 7,
                CFO: 8,
                GENERAL_ACCOUNTING: 9,
            }
        }
        const LIST_OTC_APPROVAL_STATUS = {
            ID: "customlist_tsc_otc_approval_status",
            VALUE: {
                PENDING_SUBMISSION: 1,
                PENDING_APPROVAL: 2,
                APPROVED: 3,
                REJECTED: 4,
            }
        }

        const LIST_OTC_CUSTOMER_APPROVAL_STAGE = {
            ID: "customlist_tsc_otc_cust_approval_stage",
            VALUE: {
                CREDIT_LIMIT: 1,
                TERMS: 2,
                GENERAL: 3,
            }
        }

        const OTC_APPROVAL_CUST_THRESHOLD_CONFIG = {
            ID: "customrecord_tsc_otc_cust_thresh_appr_cf",
            FIELDS: {
                APPROVAL_STAGE: "custrecord_tsc_otc_cust_appr_stage",
                APPROVER_ROLE: "custrecord_tsc_otc_cust_appr_role",
                AMOUNT_START: "custrecord_tsc_otc_cust_amt_start",
                AMOUNT_END: "custrecord_tsc_otc_cust_amt_end",
                DAY_START: "custrecord_tsc_otc_cust_day_start",
                DAY_END: "custrecord_tsc_otc_cust_day_end",
                BRAND: "custrecord_tsc_otc_cust_brand",
            }
        }

        const OTC_CUST_APPROVAL_LOG = {
            ID: "customrecord_tsc_otc_cust_appr_log",
            FIELDS: {
                CUSTOM_FORM: "customform",
                REQUESTOR: "custrecord_tsc_otc_cust_req_user",
                CUSTOMER: "custrecord_tsc_otc_cust_customer",
                CREDIT_LIMIT_AMT: "custrecord_tsc_otc_cust_cred_limit_amt",
                CREDIT_LIMIT_REQ_APPROVER: "custrecord_tsc_otc_cust_crd_lmt_req_appr",
                CREDIT_LIMIT_APPROVER: "custrecord_tsc_otc_cust_cred_limit_apprv",
                DAYS_TO_APPROVE: "custrecord_tsc_otc_cust_days",
                TERMS_REQ_APPROVER: "custrecord_tsc_otc_cust_terms_req_appr",
                TERMS_APPROVER: "custrecord_tsc_otc_cust_terms_apprv",
                GEN_ACCTG_APPROVER: "custrecord_tsc_otc_cust_gen_acct_apprv",
                CREDIT_LIMIT_STATUS: "custrecordtsc_otc_cust_cred_limit_status",
                TERMS_STATUS: "custrecordtsc_otc_cust_term_status",
                GEN_ACCTG_STATUS: "custrecordtsc_otc_cust_gen_acctg_status",
                PENDING_JSON_CHANGES: "custrecord_tsc_otc_cust_pendng_json_chng",
                HIGHEST_APPROVER: "custrecord_tsc_otc_cust_highest_approver",
                APPROVED_BY_USER: "custrecord_tsc_otc_cust_approved_by_user",
                APPROVED_BY_ROLE: "custrecord_tsc_otc_cust_approved_by_role",
                APPROVAL_STATUS: "custrecord_tsc_otc_cust_approval_status",
                REJECTED_BY_USER: "custrecord_tsc_otc_cust_rejected_by_user",
                REJECTED_BY_ROLE: "custrecord_tsc_otc_cust_rejected_by_role",
            }
        }

        const CUSTOMER_STATES = {
            PENDING_SUBMISSION_CREATE: {
                isinactive: true,
                [ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_SUBMISSION
            },
            PENDING_SUBMISSION_EDIT: {
                isinactive: false,
                [ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_SUBMISSION,
            },
            PENDING_APPROVAL: {
                [ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL
            },
            REJECTED_CREATE: {
                isinactive: true,
                [ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: LIST_OTC_APPROVAL_STATUS.VALUE.REJECTED
            },
            REJECTED_EDIT: {
                [ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: LIST_OTC_APPROVAL_STATUS.VALUE.REJECTED
            },
            APPROVED: {
                [ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED
            },
        }

        const SUITELETURLS = {
            OTC_CUST_APPROVAL: {
                SCRIPT_ID: 'customscript_tsc_sl_otc_cust_approval',
                DEPLOYMENT_ID: 'customdeploy_tsc_sl_otc_cust_approval'
            }
        }

        const determineState = (record, recType) => {
            const STATES = {
                customer: CUSTOMER_STATES
            };

            const recStates = STATES[recType];
            if (!recStates) {
                return null; // Unsupported record type
            }

            for (const [state, criteria] of Object.entries(recStates)) {
                const matches = Object.entries(criteria).every(([field, value]) =>
                    record.getValue({ fieldId: field }) == value
                );

                if (matches) {
                    return state; // Return the matching state
                }
            }

            return null; // No matching state found
        };
        const APPROVER_RANKING = {
            SANDVIK_CEO: 1,         // Highest
            SMF_CEO: 2,
            CFO: 3,
            BU_PRESIDENT: 4,
            VP_SALES: 5,
            FINANCIAL_CONTROLLER: 6,
            SALES_DIRECTOR: 7,
            SALES_MANAGER: 8,
            GENERAL_ACCOUNTING: 9   // Lowest
        };

        return {
            BODY_FIELDS_TO_TRACK,
            SUBRECORDS_TO_TRACK,
            SUBLISTS_TO_TRACK,
            ENTITY_FIELDS,
            LIST_OTC_APPROVAL_STATUS,
            LIST_OTC_CUSTOMER_APPROVAL_STAGE,
            LIST_LOA_ROLES,
            OTC_APPROVAL_CUST_THRESHOLD_CONFIG,
            OTC_CUST_APPROVAL_LOG,
            SUITELETURLS,
            determineState,
            APPROVER_RANKING
        }

    });
