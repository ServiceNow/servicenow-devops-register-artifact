const core = require('@actions/core');
const axios = require('axios');


(async function main() {
    let instanceUrl = core.getInput('instance-url', { required: true });
    const toolId = core.getInput('tool-id', { required: true });
    const username = core.getInput('devops-integration-user-name', { required: false });
    const password = core.getInput('devops-integration-user-password', { required: false });
    const token = core.getInput('devops-integration-token', { required: false });
    const jobName = core.getInput('job-name', { required: true });

    let artifacts = core.getInput('artifacts', { required: true });
    
    try {
        artifacts = JSON.parse(artifacts);
    } catch (e) {
        core.setFailed(`Failed parsing artifacts ${e}`);
        return;
    }

    let githubContext = core.getInput('context-github', { required: true });

    try {
        githubContext = JSON.parse(githubContext);
    } catch (e) {
        core.setFailed(`Exception parsing github context ${e}`);
    }

    let payload;
    
    try {
        instanceUrl = instanceUrl.trim();
        if (instanceUrl.endsWith('/'))
            instanceUrl = instanceUrl.slice(0, -1);

        payload = {
            'artifacts': artifacts,
            'pipelineName': `${githubContext.repository}/${githubContext.workflow}`,
            'stageName': jobName,
            'taskExecutionNumber': `${githubContext.run_id}` + '/attempts/' + `${githubContext.run_attempt}`, 
            'branchName': `${githubContext.ref_name}`
        };
        console.log("paylaod to register artifact: " + JSON.stringify(payload));
    } catch (e) {
        core.setFailed(`Exception setting the payload to register artifact ${e}`);
        return;
    }

    let snowResponse;
    let endpoint = '';
    let httpHeaders = {};
    try {
        if(token === '' && username === '' && password === '') {
            core.setFailed('Either secret token or integration username, password is needed for integration user authentication');
        }
        else if(token !== '') {
            endpoint = `${instanceUrl}/api/sn_devops/v2/devops/artifact/registration?orchestrationToolId=${toolId}`;
            const defaultHeadersForToken = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'sn_devops.DevOpsToken '+`${toolId}:${token}`
            };

            httpHeaders = { headers: defaultHeadersForToken };
            snowResponse = await axios.post(endpoint, JSON.stringify(payload), httpHeaders);
        }
        else if(username !== '' && password !== '') {
            endpoint = `${instanceUrl}/api/sn_devops/v1/devops/artifact/registration?orchestrationToolId=${toolId}`;
            const tokenBasicAuth = `${username}:${password}`;
            const encodedTokenForBasicAuth = Buffer.from(tokenBasicAuth).toString('base64');;
            const defaultHeadersForBasicAuth = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Basic ' + `${encodedTokenForBasicAuth}`
            };

            httpHeaders = { headers: defaultHeadersForBasicAuth };
            snowResponse = await axios.post(endpoint, JSON.stringify(payload), httpHeaders);
        }
        else {
            core.setFailed("For Basic Auth, Username and Password is mandatory for integration user authentication");
        }
    } catch (e) {
        if (e.message.includes('ECONNREFUSED') || e.message.includes('ENOTFOUND') || e.message.includes('405')) {
            core.setFailed('ServiceNow Instance URL is NOT valid. Please correct the URL and try again.');
        } else if (e.message.includes('401')) {
            core.setFailed('Invalid Credentials. Please correct the credentials and try again.');
            core.setFailed(`[ServiceNow DevOps] Register Artifact, Error message :${e.message}`);
            core.setFailed(`[ServiceNow DevOps] Register Artifact, Error message :${e.stack}`);

            core.setFailed("Exception :"+JSON.stringify(e));

            core.setFailed("Header :"+e.response.header+", Data :"+e.response.data);
            core.setFailed(JSON.stringify(e.response));

            core.setFailed(`[ServiceNow DevOps] Register Artifact, Error message :${e.response}`);            
        } else {
            core.setFailed('ServiceNow Artifact Versions are NOT created. Please check ServiceNow logs for more details.');
            core.setFailed(`[ServiceNow DevOps] Register Artifact, Error message :${e.message}`);
            core.setFailed(`[ServiceNow DevOps] Register Artifact, Error message :${e.stack}`);
            if(e.response){
            console.log("Response data :"+e.response);
//            console.log("Response data :"+JSON.stringify(e.response));
            console.log("Response Status :"+e.response.status);
            console.log("Response Status Text :"+e.response.statusText);
            }
        }
    }
    
})();
