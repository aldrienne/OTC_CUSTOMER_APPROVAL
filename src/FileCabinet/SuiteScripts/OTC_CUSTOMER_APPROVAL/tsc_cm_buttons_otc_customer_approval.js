/**
 * @NApiVersion 2.1
 */
define([],
    
    () => {

        const sendRequest = (suiteletUrl) =>{
            window.location.href = suiteletUrl;
        }  

        return {sendRequest}

    });
