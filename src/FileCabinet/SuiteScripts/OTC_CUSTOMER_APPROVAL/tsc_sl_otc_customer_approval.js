/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['./tsc_cm_otc_customer_approval.js', 'N/ui/serverWidget', 'N/search', 'N/record', 'N/format', 'N/currency', 'N/redirect', 'N/runtime'],

    (OTCLIB, serverWidget, search, record, format, currency, redirect, runtime) => {

        const SCRIPT_PARAM_BAD_DEBT_ACCOUNTS = 'custscript_tsc_bad_debt_accounts';

        const ORDER_STATUS = {
            PENDING_APPROVAL: 'A',
            APPROVED: 'B', //PENDING FULFILLMENT            
        }
        /**
         * Defines the Suitelet script trigger point.
         * @param {Object} scriptContext
         * @param {ServerRequest} scriptContext.request - Incoming request
         * @param {ServerResponse} scriptContext.response - Suitelet response
         * @since 2015.2
         */
        const onRequest = (scriptContext) => {
            const title = "onRequest(): ";
            if (scriptContext.request.method !== 'GET') return;
            const { action, userId, stage, logId, cuId, recType, isCreate, roles } = scriptContext.request.parameters;
            let isCreateBool = isCreate == 'true' ? true : false;
            log.debug(title + 'params', { action, userId, stage, logId, cuId, recType, isCreateBool });
            switch (action) {
                case 'submit_cu_for_approval':
                    submitCuForApproval(cuId, userId, recType, isCreateBool);
                    break;
                case 'approve_customer':
                    processApprovalLog(cuId, recType, parseInt(stage), userId, logId, 'approve', roles);
                    updateCustomerStatus(logId, cuId, recType, isCreateBool);
                    break;
                case 'reject_customer':
                    processApprovalLog(cuId, recType, parseInt(stage), userId, logId, 'reject', roles);
                    updateCustomerStatus(logId, cuId, recType, isCreateBool);
                    break;
                default:
                    break;
            }

        }

        const processApprovalLog = (cuId, recType, stage, userId, logId, decision, roles) => {
            const title = "approveLog(): ";
            log.debug(title + 'params', { cuId, stage, logId, roles });
            roles = roles.split(',');
            let decisionStatus;
            if (decision == 'approve') {
                decisionStatus = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
            } else {
                decisionStatus = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.REJECTED;
            }


            let values = {};
            switch (stage) {
                case 0:
                    if (decision == 'approve') {
                        values = {
                            [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_USER]: userId,
                            [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE]: roles,
                        }
                    } else {
                        values = {
                            [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.REJECTED_BY_USER]: userId,
                            [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.REJECTED_BY_ROLE]: roles,
                        }
                    }
                    break;
                case OTCLIB.LIST_OTC_CUSTOMER_APPROVAL_STAGE.VALUE.GENERAL:
                    values = {
                        [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.GEN_ACCTG_STATUS]: decisionStatus,
                        [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.GEN_ACCTG_APPROVER]: userId
                    };
                    break;
            }
            updateApprovalLog(logId, values, stage, decision);
        };

        const submitCuForApproval = (cuId, userId, recType, isCreate) => {
            const title = "submitCuForApproval(): ";
            log.debug(title + 'params', { cuId, userId, isCreate });
            //Retrieve Pending Changes
            let customerFields = search.lookupFields({
                type: recType,
                id: cuId,
                columns: [OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES, OTCLIB.ENTITY_FIELDS.BRAND, 'currency']
            });
            log.debug(title + 'customerFields', customerFields);
            let pendingChanges, brand, sourceCurrency;
            //Validate pendingChanges
            if (customerFields && customerFields[OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES]) {
                pendingChanges = JSON.parse(customerFields[OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES]);
                log.debug(title + 'pendingChanges', pendingChanges);
            }
            if (customerFields && customerFields[OTCLIB.ENTITY_FIELDS.BRAND]) {
                brand = customerFields[OTCLIB.ENTITY_FIELDS.BRAND][0]['value'];
                log.debug(title + 'brand', brand);
            }

            if (customerFields && customerFields['currency']) {
                sourceCurrency = customerFields['currency'][0]['value']
                log.debug(title + 'currency', sourceCurrency);
            }

            //Construct OTC CUSTOMER APPROVAL LOG OBJ
            let otcApprovalLogObj = {};
            //General Info
            otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.REQUESTOR] = userId;
            otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CUSTOMER] = cuId;
            otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.PENDING_JSON_CHANGES] = JSON.stringify(pendingChanges);

            //Credit Limit Info
            if (pendingChanges.fields.creditlimit && pendingChanges.fields.creditlimit.newValue) {
                let creditLimitAmt = pendingChanges.fields.creditlimit.newValue || 0;
                //Convert to USD if currency is not USD and if credit limit is greater than 0
                creditLimitAmt = convertAmountToUsd(creditLimitAmt, sourceCurrency) || 0;
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_AMT] = creditLimitAmt;
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_REQ_APPROVER] = getRequiredApprover(brand, OTCLIB.LIST_OTC_CUSTOMER_APPROVAL_STAGE.VALUE.CREDIT_LIMIT, creditLimitAmt);
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_STATUS] = otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_REQ_APPROVER] ? OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL : OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
            } else {
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_AMT] = 0;
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_REQ_APPROVER] = null;
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
            }

            //Terms Info
            if (pendingChanges.fields.terms && pendingChanges.fields.terms.newValue) {
                let termsDays = retrieveDaysFromTerms(pendingChanges.fields.terms.newValue);
                log.debug(title + 'termsDays', termsDays);
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.DAYS_TO_APPROVE] = termsDays;
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_REQ_APPROVER] = getRequiredApprover(brand, OTCLIB.LIST_OTC_CUSTOMER_APPROVAL_STAGE.VALUE.TERMS, termsDays);
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_STATUS] = otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_REQ_APPROVER] ? OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL : OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
            } else {
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.DAYS_TO_APPROVE] = 0;
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_REQ_APPROVER] = null;
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
            }
            //Validate Credit LImit and Terms Status, if both is set to approved, set approval status to approved
            if (otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_STATUS] == OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED && otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_STATUS] == OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED) {    
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVAL_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
            }else {
                let highestApprover = getHighestApprover([
                    otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_REQ_APPROVER],
                    otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_REQ_APPROVER]
                ]);
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.HIGHEST_APPROVER] = highestApprover;
                otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVAL_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL;
            }            

            //General Accounting Info
            otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.GEN_ACCTG_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL;
            log.debug(title + 'otcApprovalLogObj', otcApprovalLogObj);

            let logStatus = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;

            if (otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_REQ_APPROVER] || otcApprovalLogObj[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_REQ_APPROVER]) {
                logStatus = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL;
            }
            //Temporarily activate customer record
            if (isCreate) {
                updateCustomerActiveStatus(cuId, recType, false);
            }
            //Create OTC Approval Log Record
            let otcApprovalLogId = createOTCCustApprovalLog(otcApprovalLogObj);
            if (otcApprovalLogId) {


                //Update Customer OTC Approval Log
                let id = record.submitFields({
                    type: recType,
                    id: cuId,
                    values: {
                        [OTCLIB.ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL
                    }
                });
                //Inactivate customer record
                if (isCreate) {
                    updateCustomerActiveStatus(cuId, recType, true);
                    log.debug(title + 'id', id);
                }
            }

            redirect.toRecord({
                type: recType,
                id: cuId
            });
        }
        const retrieveDaysFromTerms = (termsId) => {
            const title = "retrieveDaysFromTerms(): ";
            log.debug(title + 'params', { termsId });
            let termsFields;
            try {
                termsFields = search.lookupFields({
                    type: 'term',
                    id: termsId,
                    columns: ['daysuntilnetdue']
                });
            } catch (e) {
                log.error(title + 'error', e);
            }

            if (termsFields && termsFields['daysuntilnetdue']) {
                return termsFields['daysuntilnetdue'];
            } else {
                return 0;
            }

        }
        const convertAmountToUsd = (amount, sourceCurrency) => {
            let exchangeRate = currency.exchangeRate({
                source: sourceCurrency,
                target: 'USD',
            });
            return amount * exchangeRate;
        }

        const getRequiredApprover = (brand, approvalStageType, value) => {
            const title = "getRequiredApprover(): ";
            log.debug(title + 'params', { brand, approvalStageType, value });

            if (brand) {
                brandFilter = [OTCLIB.OTC_APPROVAL_CUST_THRESHOLD_CONFIG.FIELDS.BRAND, 'anyof', brand];
            } else {
                brandFilter = [OTCLIB.OTC_APPROVAL_CUST_THRESHOLD_CONFIG.FIELDS.BRAND, 'anyof', '@NONE@'];
            }


            const filters = [
                brandFilter,
                'AND',
                [OTCLIB.OTC_APPROVAL_CUST_THRESHOLD_CONFIG.FIELDS.APPROVAL_STAGE, 'anyof', approvalStageType],
            ]


            if (approvalStageType == OTCLIB.LIST_OTC_CUSTOMER_APPROVAL_STAGE.VALUE.CREDIT_LIMIT) {
                filters.push('AND');
                filters.push([OTCLIB.OTC_APPROVAL_CUST_THRESHOLD_CONFIG.FIELDS.AMOUNT_START, 'lessthan', value]);
                filters.push('AND');
                filters.push([OTCLIB.OTC_APPROVAL_CUST_THRESHOLD_CONFIG.FIELDS.AMOUNT_END, 'greaterthanorequalto', value]);
            } else if (approvalStageType == OTCLIB.LIST_OTC_CUSTOMER_APPROVAL_STAGE.VALUE.TERMS) {
                filters.push('AND');
                filters.push([OTCLIB.OTC_APPROVAL_CUST_THRESHOLD_CONFIG.FIELDS.DAY_START, 'lessthan', value]);
                filters.push('AND');
                filters.push([OTCLIB.OTC_APPROVAL_CUST_THRESHOLD_CONFIG.FIELDS.DAY_END, 'greaterthanorequalto', value]);
            }


            const approverCol = search.createColumn({
                name: OTCLIB.OTC_APPROVAL_CUST_THRESHOLD_CONFIG.FIELDS.APPROVER_ROLE,
            });

            log.debug('searchFilters', {
                filters,
                approverCol
            })

            const customrecordTscOtcCustThreshApprCfSearch = search.create({
                type: 'customrecord_tsc_otc_cust_thresh_appr_cf',
                filters: filters,
                columns: [
                    approverCol,
                ],
            });

            let approvers = [];
            let searchResults = customrecordTscOtcCustThreshApprCfSearch.run().getRange({
                start: 0,
                end: 5
            });

            searchResults.forEach((result) => {
                log.debug(title + 'result', result);
                result.getValue(approverCol).split(',').forEach((approver) => {
                    approvers.push(approver);
                });
            });

            if (searchResults.length > 0) {
                return approvers;
            } else {
                return null;
            }
        }

        const updateApprovalLog = (logId, values, stage, decision) => {
            const title = "updateApprovalLog(): ";
            log.debug(title + 'params', { logId, values });
            if (stage == 0) {
                if (decision == 'approve') {
                    //Need to retreive the value for approved by and append the new approver
                    let logValues = search.lookupFields({
                        type: OTCLIB.OTC_CUST_APPROVAL_LOG.ID,
                        id: logId,
                        columns: [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE, OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_USER, OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.HIGHEST_APPROVER]
                    });

                    if (logValues) {
                        if (logValues[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE] && logValues[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE].length > 0) {
                            const existingRoles = logValues[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE].map(item => typeof item === 'object' ? item.value : item);
                            const newRoles = (values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE] || []).map(item => typeof item === 'object' ? item.value : item);
                            values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE] = [...new Set(existingRoles.concat(newRoles))];
                        }
                        if (logValues[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_USER] && logValues[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_USER].length > 0) {
                            const existingUsers = logValues[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_USER].map(item => typeof item === 'object' ? item.value : item);
                            let approvedByUsersValue = values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_USER];
                            if (!Array.isArray(approvedByUsersValue)) {
                                approvedByUsersValue = approvedByUsersValue ? [approvedByUsersValue] : [];
                            }
                            const newUsers = approvedByUsersValue.map(item => typeof item === 'object' ? item.value : item);
                            values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_USER] = [...new Set(existingUsers.concat(newUsers))];
                        }
                    }

                    //Copmpare highest approver with approved by role
                    const requiredApprover = logValues[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.HIGHEST_APPROVER].map(item => typeof item === 'object' ? item.value : item);
                    log.debug(title + 'requiredApprover', { requiredApprover: requiredApprover, approvedByRole: values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE] });

                    const approvedByRoleValues = (values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE] || []).map(item =>
                        typeof item === 'object' ? item.value : item
                    );
                    if (
                        approvedByRoleValues.length === requiredApprover.length &&
                        requiredApprover.every(role => approvedByRoleValues.includes(role))
                    ) {
                        values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVAL_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
                        values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
                        values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
                    }
                }else{
                    values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVAL_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.REJECTED;
                    values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.REJECTED;
                    values[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_STATUS] = OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.REJECTED;
                }
                log.debug(title + 'values', values);
            }
            record.submitFields({
                type: OTCLIB.OTC_CUST_APPROVAL_LOG.ID,
                id: logId,
                values: values
            });
        };

        const updateCustomerStatus = (logId, cuId, recType, isCreate) => {
            const title = "updateCustomerStatus(): ";
            log.debug(title + 'params', { logId, cuId, isCreate });
            let logValues = search.lookupFields({
                type: OTCLIB.OTC_CUST_APPROVAL_LOG.ID,
                id: logId,
                columns: [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVAL_STATUS, OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.GEN_ACCTG_STATUS, OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.PENDING_JSON_CHANGES]
            });
            log.debug(title + 'logValues', logValues);

            let approvedCounter = 0;
            let rejectedCounter = 0;
            [OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVAL_STATUS, OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.GEN_ACCTG_STATUS].forEach((field) => {
                if (logValues[field] && logValues[field][0] && logValues[field][0]['value'] == OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED) {
                    approvedCounter++;
                } else if (logValues[field] && logValues[field][0] && logValues[field][0]['value'] == OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.REJECTED) {
                    rejectedCounter++;
                }
            });
            log.debug(title + 'values', { approvedCounter, rejectedCounter });

            let reqApproveNum = 2
            if (approvedCounter == reqApproveNum) {
                switch (recType) {
                    case 'customer':
                        if (isCreate) {
                            record.submitFields({
                                type: recType,
                                id: cuId,
                                values: {
                                    'isinactive': false,
                                    [OTCLIB.ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED,
                                    [OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES]: ''
                                }
                            });
                        } else {
                            applyPendingChanges(recType, cuId, logValues[OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.PENDING_JSON_CHANGES]);
                            record.submitFields({
                                type: recType,
                                id: cuId,
                                values: {
                                    'isinactive': false,
                                    [OTCLIB.ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED,
                                    [OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES]: ''
                                }
                            })
                        }
                        break;
                }
            } else if (rejectedCounter >= 1) {
                record.submitFields({
                    type: recType,
                    id: cuId,
                    values: {
                        [OTCLIB.ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.REJECTED,
                    }
                });
            }
            // Redirect to Order
            redirect.toRecord({
                type: recType,
                id: cuId
            });
        }

        const applyPendingChanges = (recordType, recordId, pendingChangesJSON) => {
            const title = "applyPendingChanges(): ";
            log.debug(title + 'params', { recordType, recordId, pendingChangesJSON });
            try {
                // Parse the pending changes JSON
                const pendingChanges = JSON.parse(pendingChangesJSON);
        
                // Load the record for modification (using dynamic mode)
                const rec = record.load({
                    type: recordType,
                    id: recordId,
                    isDynamic: true
                });
        
                // Apply changes to body fields (unchanged)
                if (pendingChanges.fields) {
                    for (const [fieldId, change] of Object.entries(pendingChanges.fields)) {
                        log.debug(title + 'Setting Body Field', { fieldId, change });
                        rec.setValue({
                            fieldId: fieldId,
                            value: change.newValue
                        });
                    }
                }
        
                // **NEW: Use revised structure for sublists with both line-level and subrecord fields**
                if (pendingChanges.subrecords) {
                    // pendingChanges.subrecords keys are sublistIds (e.g., "addressbook", "customsublist", etc.)
                    Object.keys(pendingChanges.subrecords).forEach(sublistId => {
                        // Retrieve the sublist configuration from OTCLIB.SUBLISTS_TO_TRACK
                        const sublistConfig = OTCLIB.SUBLISTS_TO_TRACK[sublistId];
                        if (!sublistConfig) {
                            log.error('Missing Sublist Config', `No config for sublist: ${sublistId}`);
                            return;
                        }
                        const sublistChanges = pendingChanges.subrecords[sublistId];
        
                        // Loop through each line (line index is the key)
                        Object.entries(sublistChanges).forEach(([line, lineChanges]) => {
                            rec.selectLine({ sublistId, line: parseInt(line, 10) });
        
                            // **Handle sublist (line-level) fields changes**
                            if (lineChanges.sublistFields) {
                                for (const [fieldId, change] of Object.entries(lineChanges.sublistFields)) {
                                    log.debug(`${title}Updating sublist field ${fieldId} on line ${line}`, { newValue: change.newValue });
                                    rec.setCurrentSublistValue({
                                        sublistId,
                                        fieldId,
                                        value: change.newValue
                                    });
                                }
                            }
        
                            // **Handle subrecord fields changes if present**
                            if (lineChanges.subrecords) {
                                // Loop through each subrecord defined in this sublist line (e.g., "addressbookaddress")
                                Object.entries(lineChanges.subrecords).forEach(([subrecordFieldId, fieldsChanges]) => {
                                    // Retrieve the subrecord on the current line
                                    const subrec = rec.getCurrentSublistSubrecord({
                                        sublistId,
                                        fieldId: subrecordFieldId
                                    });
                                    for (const [fieldId, change] of Object.entries(fieldsChanges)) {
                                        log.debug(`${title}Updating subrecord field ${fieldId} under ${subrecordFieldId} on line ${line}`, { newValue: change.newValue });
                                        subrec.setValue({
                                            fieldId,
                                            value: change.newValue
                                        });
                                    }
                                });
                            }
        
                            // Commit the line after applying changes
                            rec.commitLine({ sublistId });
                        });
                    });
                }
        
                // Save the record after applying all changes
                rec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });
        
                return true; // Indicate success
            } catch (error) {
                log.error('Error Applying Pending Changes', error);
                return false; // Indicate failure
            }
        };
        


        const autoApplyCM = (cmId) => {
            const title = "autoApplyCM(): ";
            log.debug(title + 'params', { cmId });
            try {
                let cmRec = record.load({
                    type: record.Type.CREDIT_MEMO,
                    id: cmId,
                    isDynamic: true
                });

                let createdFrom = cmRec.getValue({
                    fieldId: 'createdfrom'
                });

                if (createdFrom) {
                    cmRec.setValue({
                        fieldId: 'autoapply',
                        value: true
                    });
                }
                cmRec.save();
            } catch (e) {
                log.error(title + 'error', e);
            }


        }

        const submitSoForApproval = (soId, userId) => {
            const title = "createOTCApprovalLog(): ";
            const { brand, entity, trandate } = getOrderDetails(soId, record.Type.SALES_ORDER);
            const { entityCurrency, creditlimit, consolbalanceUsd } = getEntityDetails(entity);
            log.debug(title + 'params', { soId, userId, brand });


            const currentOrderAmountInUSD = getOrdAmountInUsd(soId);
            let otcApprovalLogObj = {};
            //Generate Info
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.REQUESTOR] = userId;
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.ORDER] = soId;

            //Amount Info
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.ORDER_AMOUNT] = currentOrderAmountInUSD
            const amountStage = setApprovalStageData(brand, OTCLIB.LIST_OTC_APPROVAL_STAGE.VALUE.AMOUNT, currentOrderAmountInUSD);
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.ORDER_AMOUNT_REQ_APPROVER] = amountStage.requiredApprover;
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.ORDER_AMOUNT_STATUS] = amountStage.status;

            //Amount Above Limit Info            
            let foreignCurrencyToUsd = currency.exchangeRate({
                source: entityCurrency,
                target: 'USD',
            });
            log.debug(title + 'foreignCurrencyToUsd', foreignCurrencyToUsd);
            log.debug('consolbalanceUsd', consolbalanceUsd);

            let convertedCreditLimitUsd = creditlimit * foreignCurrencyToUsd;
            let amountAboveLimit = Math.max(consolbalanceUsd - convertedCreditLimitUsd, 0);
            log.debug(title + 'amountAboveLimit', amountAboveLimit);

            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.AMOUNT_ABOVE_LIMIT] = amountAboveLimit;
            const amountAboveLimitStage = setApprovalStageData(brand, OTCLIB.LIST_OTC_APPROVAL_STAGE.VALUE.ABOVE_CREDIT_LIMIT, amountAboveLimit);
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.AMOUNT_ABOVE_LIMIT_REQ_APPROVER] = amountAboveLimitStage.requiredApprover;
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.AMOUNT_ABOVE_LIMIT_STATUS] = amountAboveLimitStage.status;

            //Discount Deduction Info
            //1. Retrieve the deduction amount and percentage (use helper function)
            let deductionValues = getDeductionAmountPercent(soId);
            log.debug(title + 'deductionValues', deductionValues);
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_AMOUNT] = deductionValues[OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_AMOUNT];
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_PERCENT] = deductionValues[OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_PERCENT];

            const deductionStage = setApprovalStageData(brand, OTCLIB.LIST_OTC_APPROVAL_STAGE.VALUE.DISCOUNT_DEDUCTION, deductionValues[OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_PERCENT]);
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_REQ_APPROVER] = deductionStage.requiredApprover;
            otcApprovalLogObj[OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_STATUS] = deductionStage.status;


            //Create OTC Approval Log Record
            log.debug(title + 'otcApprovalLogObj', otcApprovalLogObj);
            let otcApprovalLogId = createOTCApprovalLog(otcApprovalLogObj);

            if (otcApprovalLogId) {
                //Update Sales Order OTC Approval Log
                let id = record.submitFields({
                    type: record.Type.SALES_ORDER,
                    id: soId,
                    values: {
                        [OTCLIB.TRAN_BODY_FIELDS.OTC_APPROVAL_STATUS]: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL
                    }
                });
                log.debug(title + 'id', id);
            }

            //Redirect to Sales Order
            redirect.toRecord({
                type: record.Type.SALES_ORDER,
                id: soId
            });
        }

        function setApprovalStageData(brand, stageConstant, stageAmount) {
            const title = "setApprovalStageData(): ";
            log.debug(title + 'params', { brand, stageConstant, stageAmount });
            const requiredApprover = getRequiredApprover(brand, stageConstant, stageAmount);
            log.debug(title + 'requiredApprover', requiredApprover);
            const status = requiredApprover ? OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL
                : OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.APPROVED;
            return { requiredApprover, status };
        }

        const updateCustomerActiveStatus = (cuId, recType, status) => {
            const title = "activateInactivateCustomerRecord(): ";
            record.submitFields({
                type: recType,
                id: cuId,
                values: {
                    'isinactive': status
                }
            });
            log.debug(title + 'status', status);
        }

        const createOTCCustApprovalLog = (otcApprovalLogObj) => {
            const title = "createOTCApprovalLog(): ";
            log.debug(title + 'params', otcApprovalLogObj);
            let rec = record.create({
                type: OTCLIB.OTC_CUST_APPROVAL_LOG.ID,
                isDynamic: true,
            });

            for (let field in otcApprovalLogObj) {
                if (field == OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CUSTOM_FORM) {
                    rec.setText({
                        fieldId: field,
                        text: otcApprovalLogObj[field],
                    })
                } else {
                    rec.setValue({
                        fieldId: field,
                        value: otcApprovalLogObj[field],
                    });
                }
            }
            return rec.save();
        }

        //Need helper function to retrieve the deduction amount AND return percentage
        const getDeductionAmountPercent = (soId) => {
            const salesOrderSearchFilters = [
                ['type', 'anyof', 'SalesOrd'],
                'AND',
                ['internalid', 'anyof', soId],
                'AND',
                ['mainline', 'is', 'F'],
                'AND',
                ['shipping', 'is', 'F'],
                'AND',
                ['taxline', 'is', 'F'],
            ];

            const salesOrderSearchColEntity = search.createColumn({ name: 'entity', summary: search.Summary.GROUP });
            const salesOrderSearchColItem = search.createColumn({ name: 'item', summary: search.Summary.GROUP });
            const salesOrderSearchColPriceLevel = search.createColumn({ name: 'pricelevel', summary: search.Summary.GROUP });
            const salesOrderSearchColCurrency = search.createColumn({ name: 'currency', summary: search.Summary.GROUP });
            const salesOrderSearchColAmountForeignCurrency = search.createColumn({ name: 'fxamount', summary: search.Summary.GROUP });
            const salesOrderSearchColQuantity = search.createColumn({ name: 'quantity', summary: search.Summary.SUM });
            const salesOrderSearchColAmount = search.createColumn({ name: 'amount', summary: search.Summary.GROUP });
            const salesOrderSearchColInlineDiscount = search.createColumn({ name: 'custcol_inline_discount', summary: search.Summary.GROUP });
            const salesOrderSearchColListRateCustomMap = search.createColumn({ name: 'custcol_list_rate_custom_map', summary: search.Summary.GROUP });
            const salesOrderSearchColTransactionDiscount = search.createColumn({ name: 'transactiondiscount', summary: search.Summary.GROUP });
            const salesOrderSearchColItemRate = search.createColumn({ name: 'rate', summary: search.Summary.GROUP });

            const salesOrderSearch = search.create({
                type: 'salesorder',
                settings: [{ "name": "consolidationtype", "value": "NONE" }],
                filters: salesOrderSearchFilters,
                columns: [
                    salesOrderSearchColEntity,
                    salesOrderSearchColItem,
                    salesOrderSearchColPriceLevel,
                    salesOrderSearchColCurrency,
                    salesOrderSearchColAmountForeignCurrency,
                    salesOrderSearchColQuantity,
                    salesOrderSearchColAmount,
                    salesOrderSearchColInlineDiscount,
                    salesOrderSearchColListRateCustomMap,
                    salesOrderSearchColTransactionDiscount,
                    salesOrderSearchColItemRate
                ],
            });

            let totalDeductionAmountForeignCurrency = 0;
            let subTotalAmountForeignCurrency = 0;

            const salesOrderSearchPagedData = salesOrderSearch.runPaged({ pageSize: 1000 });
            for (let i = 0; i < salesOrderSearchPagedData.pageRanges.length; i++) {
                const salesOrderSearchPage = salesOrderSearchPagedData.fetch({ index: i });
                salesOrderSearchPage.data.forEach((result) => {
                    const currency = result.getValue(salesOrderSearchColCurrency);
                    const inlineDiscount = result.getValue(salesOrderSearchColInlineDiscount);
                    const itemRate = result.getValue(salesOrderSearchColItemRate);
                    const amount = parseFloat(result.getValue(salesOrderSearchColAmount));
                    const quantity = result.getValue(salesOrderSearchColQuantity);
                    const transactionDiscount = result.getValue(salesOrderSearchColTransactionDiscount);
                    const origAmount = result.getValue(salesOrderSearchColListRateCustomMap);
                    //const listRate
                    log.debug('line Value', { currency, inlineDiscount, itemRate, quantity, amount, transactionDiscount });

                    if (transactionDiscount && itemRate < 0) {
                        totalDeductionAmountForeignCurrency += Math.abs(amount);
                    } else if (!transactionDiscount && inlineDiscount) {
                        let lineDeduction = (origAmount - itemRate) * quantity;
                        totalDeductionAmountForeignCurrency += lineDeduction;
                        subTotalAmountForeignCurrency += amount;
                    } else {
                        subTotalAmountForeignCurrency += amount;
                    }

                });
            }
            log.debug('totalDeductionAmountForeignCurrency', { totalDeductionAmountForeignCurrency, subTotalAmountForeignCurrency });
            //Compute the percentage based on the total deduction amount
            let deductionPercentage = totalDeductionAmountForeignCurrency / subTotalAmountForeignCurrency * 100;
            log.debug('deductionPercentage', deductionPercentage);
            return {
                [OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_AMOUNT]: totalDeductionAmountForeignCurrency,
                [OTCLIB.OTC_APPROVAL_LOG.FIELDS.DEDUCTIONS_PERCENT]: deductionPercentage
            }
        }

        const getEntityDetails = (entityId) => {
            let entityValues = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: entityId,
                columns: ['currency', 'creditlimit', 'consolbalance']
            });
            return {
                entityCurrency: entityValues.currency[0].value,
                creditlimit: entityValues.creditlimit,
                consolbalanceUsd: entityValues.consolbalance
            }
        }

        const getOrdAmountInUsd = (ordId) => {
            const title = "getOrdAmountInUsd(): ";
            log.debug(title + 'params', { ordId });
            const orderFilters = [
                ['mainline', 'is', 'T'],
                'AND',
                ['internalid', 'anyof', ordId],
            ];

            const transactionSearchColAmount = search.createColumn({ name: 'amount' });

            const orderSearch = search.create({
                type: 'transaction',
                filters: orderFilters,
                columns: [
                    transactionSearchColAmount,
                ],
            });

            let searchResults = orderSearch.run().getRange({
                start: 0,
                end: 1
            });

            if (searchResults.length > 0) {
                return searchResults[0].getValue(transactionSearchColAmount);
            } else {
                return 0;
            }
        }
        const getHighestApprover = (approverInputs) => {
            const title = 'getHighestApprover(): ';
            log.debug(title + 'params', { approverInputs });
            let bestGroup = null;
            let bestRank = Infinity;
            approverInputs.forEach((inputGroup) => {
                // Ensure we work with an array
                let group = Array.isArray(inputGroup) ? inputGroup : [inputGroup];
                let groupBestRank = Infinity;
                group.forEach((roleId) => {
                    let roleName = getRoleNameFromId(roleId);
                    if (roleName) {
                        let rank = OTCLIB.APPROVER_RANKING[roleName];
                        if (rank !== undefined && rank < groupBestRank) {
                            groupBestRank = rank;
                        }
                    }
                });
                if (groupBestRank < bestRank) {
                    bestRank = groupBestRank;
                    bestGroup = group;
                }
            });
            return bestGroup;
        };
        const getRoleNameFromId = (roleId) => {
            for (let roleName in OTCLIB.LIST_LOA_ROLES.VALUE) {
                // Compare as strings to ensure equality
                if (OTCLIB.LIST_LOA_ROLES.VALUE[roleName].toString() === roleId) {
                    return roleName;
                }
            }
            return null;
        };

        // const getRequiredApprover = (brand, approvalStageType, threshold) => {
        //     const title = "getRequiredApprover(): ";
        //     log.debug(title + 'params', { brand, approvalStageType, threshold });
        //     let brandFilter;
        //     //Validate if brand has a value
        //     if (brand) {
        //         brandFilter = [OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.FIELDS.BRAND, 'anyof', brand];
        //     } else {
        //         brandFilter = [OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.FIELDS.BRAND, 'anyof', '@NONE@'];
        //     }

        //     const customrecordTscOtcThreshApprCfgSearchFilters = [
        //         brandFilter,
        //         'AND',
        //         [OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.FIELDS.APPROVAL_STAGE, 'anyof', approvalStageType],
        //     ];

        //     if (approvalStageType == OTCLIB.LIST_OTC_APPROVAL_STAGE.VALUE.AMOUNT || approvalStageType == OTCLIB.LIST_OTC_APPROVAL_STAGE.VALUE.ABOVE_CREDIT_LIMIT || approvalStageType == OTCLIB.LIST_OTC_APPROVAL_STAGE.VALUE.CREDIT_MEMO) {
        //         customrecordTscOtcThreshApprCfgSearchFilters.push('AND');
        //         customrecordTscOtcThreshApprCfgSearchFilters.push([OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.FIELDS.AMOUNT_START, 'lessthan', threshold]);
        //         customrecordTscOtcThreshApprCfgSearchFilters.push('AND');
        //         customrecordTscOtcThreshApprCfgSearchFilters.push([OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.FIELDS.AMOUNT_END, 'greaterthanorequalto', threshold]);
        //     } else if (approvalStageType == OTCLIB.LIST_OTC_APPROVAL_STAGE.VALUE.DISCOUNT_DEDUCTION) {
        //         customrecordTscOtcThreshApprCfgSearchFilters.push('AND');
        //         customrecordTscOtcThreshApprCfgSearchFilters.push([OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.FIELDS.PERCENT_START, 'lessthan', threshold]);
        //         customrecordTscOtcThreshApprCfgSearchFilters.push('AND');
        //         customrecordTscOtcThreshApprCfgSearchFilters.push([OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.FIELDS.PERCENT_END, 'greaterthanorequalto', threshold]);
        //     }

        //     const customrecordTscOtcThreshApprCfgSearchColApproverRole = search.createColumn({ name: OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.FIELDS.APPROVER_ROLE });
        //     log.debug(title + 'filters', customrecordTscOtcThreshApprCfgSearchFilters);
        //     const customrecordTscOtcThreshApprCfgSearch = search.create({
        //         type: OTCLIB.OTC_APPROVAL_THRESHOLD_CONFIG.ID,
        //         filters: customrecordTscOtcThreshApprCfgSearchFilters,
        //         columns: [
        //             customrecordTscOtcThreshApprCfgSearchColApproverRole,
        //         ],
        //     });
        //     let approvers = [];
        //     let searchResults = customrecordTscOtcThreshApprCfgSearch.run().getRange({
        //         start: 0,
        //         end: 5
        //     });

        //     searchResults.forEach((result) => {
        //         log.debug(title + 'result', result);
        //         result.getValue(customrecordTscOtcThreshApprCfgSearchColApproverRole).split(',').forEach((approver) => {
        //             approvers.push(approver);
        //         });
        //     });

        //     if (searchResults.length > 0) {
        //         return approvers;
        //     } else {
        //         return null;
        //     }
        // }

        const getOrderDetails = (ordId, recordType) => {
            const title = 'getOrderDetails(): ';
            log.debug(`${title}params`, { ordId, recordType });

            let orderValues = search.lookupFields({
                type: recordType,
                id: ordId,
                columns: ['custbody_brand', 'entity', 'trandate']
            });
            log.debug(`${title}orderValues`, orderValues);

            // Validate arrays before accessing [0]
            const brand = Array.isArray(orderValues.custbody_brand) && orderValues.custbody_brand.length
                ? orderValues.custbody_brand[0].value
                : null;

            const entity = Array.isArray(orderValues.entity) && orderValues.entity.length
                ? orderValues.entity[0].value
                : null;

            // trandate should be a direct value
            const trandate = orderValues.trandate || null;

            return { brand, entity, trandate };
        };




        return { onRequest }

    });
