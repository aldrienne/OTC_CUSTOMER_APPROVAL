/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['./tsc_cm_otc_customer_approval', 'N/runtime', 'N/url', 'N/ui/serverWidget', 'N/search', 'N/record'],

    (OTCLIB, runtime, url, serverWidget, search, record) => {

        const CUSTOMER_STAGE_TYPE = {
            GEN_ACCTG: {
                approveFn: 'custpage_tsc_approve_gen_acctg',
                rejectFn: 'custpage_tsc_reject_gen_acctg',
                approveLabel: 'Approve General Accounting',
                rejectLabel: 'Reject General Accounting',
                stageValue: OTCLIB.LIST_OTC_CUSTOMER_APPROVAL_STAGE.VALUE.GENERAL
            },
            CRED_LIMIT_TERMS: {
                approveFn: 'custpage_tsc_approve',
                rejectFn: 'custpage_tsc_reject',
                approveLabel: 'Approve',
                rejectLabel: 'Reject',
                stageValue: 0
            }
        };
        /**
         * Defines the function definition that is executed before record is loaded.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @param {Form} scriptContext.form - Current form
         * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
         * @since 2015.2
         */
        const beforeLoad = (scriptContext) => {
            const title = 'beforeLoad(): ';
            let newRec = scriptContext.newRecord;
            const form = scriptContext.form;
            if (newRec.type == 'customer') {
                let state = OTCLIB.determineState(newRec, newRec.type);
                log.debug(title + 'state', state);
                if (!state) return;
                //form.clientScriptModulePath = './tsc_cm_buttons_otc_customer_approval';
                if (state == 'PENDING_SUBMISSION_CREATE') {
                    if (scriptContext.type == scriptContext.UserEventType.EDIT) {
                        //Set Inactive = disabled
                        let field = scriptContext.form.getField('isinactive');
                        field.updateDisplayType({
                            displayType: serverWidget.FieldDisplayType.DISABLED
                        });
                    } else if (scriptContext.type == scriptContext.UserEventType.VIEW) {
                        //Remove Buttons
                        removeButtonIfExists(form, ['custpage_ava_getcertificates', 'custpage_ava_getcertificatestatus', 'acceptpayment']);
                        //Add Submit for Approval Button
                        let customerId = newRec.id;
                        let currentUserId = runtime.getCurrentUser().id;
                        const suiteletUrl = createSubmitForApprovalSuiteletUrl(customerId, currentUserId, newRec.type, true);
                        log.debug(title + 'suiteletUrl', suiteletUrl);
                        form.addButton({
                            id: 'custpage_tsc_submit_approval',
                            label: 'Submit for Approval',
                            functionName: sendRequestToSuitelet(suiteletUrl)
                        });
                    }
                } else if (state == 'PENDING_APPROVAL') {
                    removeButtonIfExists(form, ['edit', 'custpage_ava_getcertificates', 'custpage_ava_getcertificatestatus', 'acceptpayment']);
                    //Add buttons for necessary users (by role and brand, based on config)
                    const approversObj = getApprovers(newRec.id);
                    log.debug('approversObj', approversObj);
                    if (!approversObj) return;
                    let currentUserId = runtime.getCurrentUser().id;
                    let currentCustomRole = search.lookupFields({
                        type: search.Type.EMPLOYEE,
                        id: currentUserId,
                        columns: [OTCLIB.ENTITY_FIELDS.LOA_APPROVER_ROLE, OTCLIB.ENTITY_FIELDS.LOA_APPROVER_BRAND]
                    });
                    if (!currentCustomRole) return;
                    //CurrentCustomRole returns an array of object {value}
                    let currentUserRole = currentCustomRole[OTCLIB.ENTITY_FIELDS.LOA_APPROVER_ROLE].map(role => role.value);
                    let currentUserBrand = currentCustomRole[OTCLIB.ENTITY_FIELDS.LOA_APPROVER_BRAND].map(brand => brand.value);
                    log.debug(title + 'currentUserConfig', { currentUserRole, currentUserBrand });

                    //retrieve order's brand
                    let custBrand = newRec.getValue(OTCLIB.ENTITY_FIELDS.BRAND);

                    //compare currentUserBrand with orderBrand
                    if (!currentUserBrand.includes(custBrand)) return;

                    log.debug(title + 'params', {
                        approversObj,
                        currentUserRole,
                        currentUserId,
                        newRecId: newRec.id,
                        newRecType: newRec.type
                    })
                    //Add approval Button for valid users
                    addApprovalButtons(form, approversObj, currentUserRole, newRec.id, newRec.type, currentUserId);
                } else if (state == 'REJECTED_CREATE') {
                    if (scriptContext.type == scriptContext.UserEventType.EDIT) {
                        //Set Inactive = disabled
                        let field = scriptContext.form.getField('isinactive');
                        field.updateDisplayType({
                            displayType: serverWidget.FieldDisplayType.DISABLED
                        });
                    }
                    else if (scriptContext.type == scriptContext.UserEventType.VIEW) {
                        //Remove Buttons
                        removeButtonIfExists(form, ['custpage_ava_getcertificates', 'custpage_ava_getcertificatestatus', 'acceptpayment']);
                        //Add Submit for Approval Button
                        let customerId = newRec.id;
                        let currentUserId = runtime.getCurrentUser().id;
                        const suiteletUrl = createSubmitForApprovalSuiteletUrl(customerId, currentUserId, newRec.type, true);
                        log.debug(title + 'suiteletUrl', suiteletUrl);
                        form.addButton({
                            id: 'custpage_tsc_submit_approval',
                            label: 'Submit for Approval',
                            functionName: sendRequestToSuitelet(suiteletUrl)
                        });
                    }
                } else if (state == 'REJECTED_EDIT') {
                    if (scriptContext.type == scriptContext.UserEventType.VIEW) {
                        //Add Submit for Approval Button
                        let customerId = newRec.id;
                        let currentUserId = runtime.getCurrentUser().id;
                        const suiteletUrl = createSubmitForApprovalSuiteletUrl(customerId, currentUserId, newRec.type, false);
                        log.debug(title + 'suiteletUrl', suiteletUrl);
                        form.addButton({
                            id: 'custpage_tsc_submit_approval',
                            label: 'Submit for Approval',
                            functionName: sendRequestToSuitelet(suiteletUrl)
                        });
                    }
                }
                else if (state == 'PENDING_SUBMISSION_EDIT') {
                    if (scriptContext.type == scriptContext.UserEventType.EDIT) {
                        //Set Inactive = disabled
                        let field = scriptContext.form.getField('isinactive');
                        field.updateDisplayType({
                            displayType: serverWidget.FieldDisplayType.DISABLED
                        });
                    } else if (scriptContext.type == scriptContext.UserEventType.VIEW) {
                        //Remove Buttons
                        removeButtonIfExists(form, ['custpage_ava_getcertificates', 'custpage_ava_getcertificatestatus', 'acceptpayment']);
                        //Add Submit for Approval Button
                        let customerId = newRec.id;
                        let currentUserId = runtime.getCurrentUser().id;
                        const suiteletUrl = createSubmitForApprovalSuiteletUrl(customerId, currentUserId, newRec.type, false);
                        log.debug(title + 'suiteletUrl', suiteletUrl);
                        form.addButton({
                            id: 'custpage_tsc_submit_approval',
                            label: 'Submit for Approval',
                            functionName: sendRequestToSuitelet(suiteletUrl)
                        });
                    }
                }
            }
        }

        /**
         * Defines the function definition that is executed before record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const beforeSubmit = (scriptContext) => {
            const title = 'beforeSubmit(): ';
            let newRec = scriptContext.newRecord;
            if (scriptContext.newRecord.type == 'customer') {
                if (scriptContext.type == 'create') {
                    //Set OTC Approval Status to Pending Submission
                    //Inactivate Customer
                    newRec.setValue({
                        fieldId: OTCLIB.ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS,
                        value: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_SUBMISSION
                    });
                    newRec.setValue({
                        fieldId: 'isinactive',
                        value: true
                    });

                    //Construct values for PENDING changes field
                    let pendingChanges = generatePendingChangesJSON(newRec, null, true);
                    if (pendingChanges) {
                        newRec.setValue({
                            fieldId: OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES,
                            value: JSON.stringify(pendingChanges)
                        });
                    }
                    log.debug(title + 'PendingChanges', pendingChanges)
                } else if (scriptContext.type == 'edit') {
                    let state = OTCLIB.determineState(newRec, newRec.type);
                    log.debug(title + 'state', state);
                    if (state == 'PENDING_SUBMISSION_CREATE') {
                        newRec.setValue({
                            fieldId: 'isinactive',
                            value: true
                        });
                        // newRec.setValue({
                        //     fieldId: OTCLIB.ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS,
                        //     value: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_SUBMISSION
                        // });

                        //Construct values for PENDING changes field                        
                        let pendingChanges = generatePendingChangesJSON(newRec, null, true);
                        if (pendingChanges) {
                            newRec.setValue({
                                fieldId: OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES,
                                value: JSON.stringify(pendingChanges)
                            });
                        }
                        log.debug(title + 'pendingChanges', pendingChanges);
                    } else if (state == "APPROVED" || state == "REJECTED_EDIT" || state == "PENDING_SUBMISSION_EDIT") {
                        let pendingChanges = generatePendingChangesJSON(newRec, scriptContext.oldRecord, false);
                        if (pendingChanges) {
                            //Update via submitfields
                            record.submitFields({
                                type: newRec.type,
                                id: newRec.id,
                                values: {
                                    [OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES]: JSON.stringify(pendingChanges),
                                    [OTCLIB.ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS]: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_SUBMISSION
                                },
                                options: {
                                    enableSourcing: false,
                                    ignoreMandatoryFields: true
                                }
                            });
                            throw "Please submit the record for approval <a href='/app/common/entity/custjob.nl?id=" + newRec.id + "'>here</a>";
                            // newRec.setValue({
                            //     fieldId: OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES,
                            //     value: JSON.stringify(pendingChanges)
                            // });
                        }

                        //Revert Changes to old values

                    } else if (state == "REJECTED_CREATE") {
                        newRec.setValue({
                            fieldId: 'isinactive',
                            value: true
                        });
                        // newRec.setValue({
                        //     fieldId: OTCLIB.ENTITY_FIELDS.LOA_OTC_APPROVAL_STATUS,
                        //     value: OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_SUBMISSION
                        // });

                        //Construct values for PENDING changes field                        
                        let pendingChanges = generatePendingChangesJSON(newRec, null, true);
                        if (pendingChanges) {
                            newRec.setValue({
                                fieldId: OTCLIB.ENTITY_FIELDS.LOA_OTC_PENDING_CHANGES,
                                value: JSON.stringify(pendingChanges)
                            });

                        }
                        log.debug(title + 'pendingChanges', pendingChanges);
                    }
                }
            }
        }

        /**
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const afterSubmit = (scriptContext) => {

        }

        const removeButtonIfExists = (form, buttonIdArray) => {
            const title = 'removeButtonIfExists(): ';
            log.debug(title + 'params', buttonIdArray);
            try {
                buttonIdArray.forEach(buttonId => {
                    log.debug(title + 'buttonId', buttonId);
                    form.removeButton({
                        id: buttonId
                    });
                });
            } catch (e) {
                log.error('Error Removing Button', { buttonId, error: e });
            }
        };

        const createSubmitForApprovalSuiteletUrl = (cuId, userId, recType, isCreate) => {
            return url.resolveScript({
                scriptId: OTCLIB.SUITELETURLS.OTC_CUST_APPROVAL.SCRIPT_ID,
                deploymentId: OTCLIB.SUITELETURLS.OTC_CUST_APPROVAL.DEPLOYMENT_ID,
                params: {
                    'action': 'submit_cu_for_approval',
                    'cuId': cuId,
                    'userId': userId,
                    'recType': recType,
                    'isCreate': isCreate
                }
            });
        }

        const generatePendingChangesJSON = (newRecord, oldRecord, isCreate) => {
            const title = 'generatePendingChangesJSON(): ';
            let pendingChanges = {
                fields: {}, // For body fields
                subrecords: {} // For subrecord fields
            };

            // Handle body fields
            OTCLIB.BODY_FIELDS_TO_TRACK.forEach((fieldId) => {
                // Normalize new value
                const rawNewValue = newRecord.getValue({ fieldId });
                const newValue = (rawNewValue === "" || rawNewValue === undefined) ? null : rawNewValue;
                
                // Normalize old value
                const rawOldValue = oldRecord ? oldRecord.getValue({ fieldId }) : null;
                const oldValue = (rawOldValue === "" || rawOldValue === undefined) ? null : rawOldValue;
        
                // On create: Track all fields. On edit: Track only if the value has changed.
                if (isCreate || newValue !== oldValue) {
                    pendingChanges.fields[fieldId] = {
                        oldValue: isCreate ? null : oldValue,
                        newValue: newValue
                    };
                }
            });

            Object.keys(OTCLIB.SUBLISTS_TO_TRACK).forEach((sublistId) => {
                const sublistConfig = OTCLIB.SUBLISTS_TO_TRACK[sublistId]; // Now has subrecords and sublistFields
                const newLineCount = newRecord.getLineCount({ sublistId });
                const oldLineCount = oldRecord ? oldRecord.getLineCount({ sublistId }) : 0;
        
                if (!pendingChanges.subrecords[sublistId]) {
                    pendingChanges.subrecords[sublistId] = {};
                }
        
                // Process each line in the sublist
                for (let i = 0; i < Math.max(newLineCount, oldLineCount); i++) {
                    let lineChanges = {};
        
                    // ---- NEW: Process Sublist Fields (line-level fields) ----
                    if (sublistConfig.sublistFields) {
                        let sublistFieldChanges = {};
                        sublistConfig.sublistFields.forEach((field) => {
                            const newValue = i < newLineCount 
                                ? newRecord.getSublistValue({ sublistId, fieldId: field, line: i }) 
                                : null;
                            const oldValue = (oldRecord && i < oldLineCount) 
                                ? oldRecord.getSublistValue({ sublistId, fieldId: field, line: i })
                                : null;
                            if (isCreate || newValue !== oldValue) {
                                sublistFieldChanges[field] = {
                                    oldValue: isCreate ? null : oldValue,
                                    newValue: newValue
                                };
                            }
                            log.debug(title + ' old vs new', { oldValue, newValue });
                        });
                        if (Object.keys(sublistFieldChanges).length > 0) {
                            lineChanges.sublistFields = sublistFieldChanges;
                        }
                    }
        
                    // ---- NEW: Process Subrecord Fields (fields inside a subrecord) ----
                    if (sublistConfig.subrecords) {
                        let subrecordChanges = {};
                        // Loop through each subrecord defined for this sublist
                        Object.keys(sublistConfig.subrecords).forEach((subrecordFieldId) => {
                            const fieldsToTrack = sublistConfig.subrecords[subrecordFieldId]; // e.g., ['addr1', 'addr2', ...]
                            const newSubrecord = i < newLineCount 
                                ? newRecord.getSublistSubrecord({ sublistId, fieldId: subrecordFieldId, line: i })
                                : null;
                            const oldSubrecord = (oldRecord && i < oldLineCount)
                                ? oldRecord.getSublistSubrecord({ sublistId, fieldId: subrecordFieldId, line: i })
                                : null;
                            let subrecFieldChanges = {};
                            fieldsToTrack.forEach((field) => {
                                const newValue = newSubrecord ? newSubrecord.getValue({ fieldId: field }) : null;
                                const oldValue = oldSubrecord ? oldSubrecord.getValue({ fieldId: field }) : null;
                                if (isCreate || newValue !== oldValue) {
                                    subrecFieldChanges[field] = {
                                        oldValue: isCreate ? null : oldValue,
                                        newValue: newValue
                                    };
                                }
                            });
                            if (Object.keys(subrecFieldChanges).length > 0) {
                                subrecordChanges[subrecordFieldId] = subrecFieldChanges;
                            }
                        });
                        if (Object.keys(subrecordChanges).length > 0) {
                            lineChanges.subrecords = subrecordChanges;
                        }
                    }
        
                    // Only add this line if there are any changes.
                    if (Object.keys(lineChanges).length > 0) {
                        pendingChanges.subrecords[sublistId][i] = lineChanges;
                    }
                }
            });
        
            return pendingChanges;
        };

        const getApprovers = (customerId) => {
            const title = 'getApprovers(): ';
            log.debug(title + 'params', customerId);
            const logFilters = [
                [
                    ['custrecord_tsc_otc_cust_customer.internalidnumber', 'equalto', customerId],
                ],
                'AND',
                [
                    ['custrecordtsc_otc_cust_cred_limit_status', 'anyof', '2'],
                    'OR',
                    ['custrecordtsc_otc_cust_term_status', 'anyof', '2'],
                    'OR',
                    ['custrecordtsc_otc_cust_gen_acctg_status', 'anyof', '2'],
                ],
            ];

            const creditLimitStatus = search.createColumn({ name: OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_STATUS });
            const creditLimitReqApprover = search.createColumn({ name: OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.CREDIT_LIMIT_REQ_APPROVER });
            const termStatus = search.createColumn({ name: OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_STATUS });
            const termReqApprover = search.createColumn({ name: OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.TERMS_REQ_APPROVER });
            const genAccountingStatus = search.createColumn({ name: OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.GEN_ACCTG_STATUS });
            const dateCreated = search.createColumn({ name: 'created', sort: search.Sort.DESC });
            const highestApprover = search.createColumn({ name: OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.HIGHEST_APPROVER });
            const approvedByRole = search.createColumn({ name: OTCLIB.OTC_CUST_APPROVAL_LOG.FIELDS.APPROVED_BY_ROLE });

            const logSearch = search.create({
                type: OTCLIB.OTC_CUST_APPROVAL_LOG.ID,
                filters: logFilters,
                columns: [
                    creditLimitStatus,
                    creditLimitReqApprover,
                    termStatus,
                    termReqApprover,
                    genAccountingStatus,
                    dateCreated,
                    highestApprover,
                    approvedByRole
                ],
            });

            const searchResults = logSearch.run().getRange({ start: 0, end: 1 });

            if (searchResults.length > 0) {
                return {
                    logId: searchResults[0].id,
                    creditLimitStatus: searchResults[0].getValue(creditLimitStatus),
                    creditLimitReqApprover: searchResults[0].getValue(creditLimitReqApprover),
                    termStatus: searchResults[0].getValue(termStatus),
                    termReqApprover: searchResults[0].getValue(termReqApprover),
                    genAccountingStatus: searchResults[0].getValue(genAccountingStatus),
                    highestApprover: searchResults[0].getValue(highestApprover),
                    approvedByRole: searchResults[0].getValue(approvedByRole),
                    creditLimitTermsStatus:
                        (searchResults[0].getValue(creditLimitStatus) == OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL ||
                            searchResults[0].getValue(termStatus) == OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL)
                            ? OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL
                            : null
                }
            }
        }

        const addApprovalButtons = (form, approversObj, currentUserRole, cuid, recType, currentUserId) => {
            const title = 'addApprovalButtons(): ';
            log.debug(title + 'params', { approversObj, currentUserRole, cuid, recType, currentUserId });
            const stages = [
                {
                    config: CUSTOMER_STAGE_TYPE.GEN_ACCTG,
                    status: approversObj.genAccountingStatus,
                    approver: OTCLIB.LIST_LOA_ROLES.VALUE.GENERAL_ACCOUNTING.toString()
                },
                {
                    config: CUSTOMER_STAGE_TYPE.CRED_LIMIT_TERMS,
                    status: approversObj.creditLimitTermsStatus,
                    approver: approversObj.highestApprover
                }
            ];
            log.debug(title + 'genaccountingconfig', stages[2]);

            stages.forEach(stage => {
                const { config, status, approver } = stage;
                // Split the approver string into an array of roles
                let approverRoles = approver.split(',');
                // Determine the matched roles between currentUserRole and approverRoles
                let matchedRoles = currentUserRole.filter(role => approverRoles.includes(role));

                // Check if the user can see the buttons by verifying the status and that there is a match
                const alreadyApprovedRoles = approversObj.approvedByRole ? approversObj.approvedByRole.split(',') : [];
                const filteredRoles = matchedRoles.filter(role => !alreadyApprovedRoles.includes(role));
                if (
                    status == OTCLIB.LIST_OTC_APPROVAL_STATUS.VALUE.PENDING_APPROVAL &&
                    filteredRoles.length > 0
                ) {
                    // Generate suitelet URLs
                    const suiteletUrl = createApproveSuiteletUrl(cuid, recType, currentUserId, config.stageValue, approversObj.logId, matchedRoles);

                    // Optionally, you can log or use matchedRoles here as needed
                    log.debug('Matched Roles', matchedRoles);

                    // Add approval buttons
                    form.addButton({
                        id: config.approveFn,
                        label: config.approveLabel,
                        functionName: sendRequestToSuitelet(suiteletUrl.approveUrl)
                    });
                    form.addButton({
                        id: config.rejectFn,
                        label: config.rejectLabel,
                        functionName: sendRequestToSuitelet(suiteletUrl.rejectUrl)
                    });
                }
            });
        };

        const createApproveSuiteletUrl = (cuId, recType, userId, stage, logId, matchedRoles) => {
            const title = 'createApproveSuiteletUrl(): ';
            log.debug(title + 'params', { cuId, recType, userId, stage, logId, matchedRoles });
            let approveUrl = url.resolveScript({
                scriptId: OTCLIB.SUITELETURLS.OTC_CUST_APPROVAL.SCRIPT_ID,
                deploymentId: OTCLIB.SUITELETURLS.OTC_CUST_APPROVAL.DEPLOYMENT_ID,
                params: {
                    'action': 'approve_customer',
                    'cuId': cuId,
                    'recType': recType,
                    'userId': userId,
                    'stage': stage,
                    'logId': logId,
                    'roles': matchedRoles.toString()
                }
            });

            let rejectUrl = url.resolveScript({
                scriptId: OTCLIB.SUITELETURLS.OTC_CUST_APPROVAL.SCRIPT_ID,
                deploymentId: OTCLIB.SUITELETURLS.OTC_CUST_APPROVAL.DEPLOYMENT_ID,
                params: {
                    'action': 'reject_customer',
                    'cuId': cuId,
                    'recType': recType,
                    'userId': userId,
                    'stage': stage,
                    'logId': logId,
                    'roles': matchedRoles.toString()
                }
            });

            return {
                approveUrl,
                rejectUrl
            }
        }

        const sendRequestToSuitelet = (suiteletUrl, target = "_self") =>{
            return 'window.open("' + suiteletUrl + '", "' + target + '")';
        }

        return { beforeLoad, beforeSubmit, afterSubmit }

    });
