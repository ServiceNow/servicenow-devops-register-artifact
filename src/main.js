const core = require('@actions/core');
const axios = require('axios');
  
function circularSafeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null && key==="_sessionCache") {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  }
  
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
            core.debug("[ServiceNow DevOps], Sending Request for Artifact Registration, Request options :"+JSON.stringify(httpHeaders)+", Payload :"+JSON.stringify(payload)+"\n");
            snowResponse = await axios.post(endpoint, JSON.stringify(payload), httpHeaders);
            if(snowResponse.data) core.debug("[ServiceNow DevOps], Receiving response for Artifact Registration, Response :"+circularSafeStringify(snowResponse.data)+"\n");
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
            core.debug("[ServiceNow DevOps], Sending Request for Artifact Registration, Request options :"+JSON.stringify(httpHeaders)+", Payload :"+JSON.stringify(payload)+"\n");
            snowResponse = await axios.post(endpoint, JSON.stringify(payload), httpHeaders);
            if(snowResponse.data) core.debug("[ServiceNow DevOps], Receiving response for Artifact Registration, Response :"+circularSafeStringify(snowResponse.data)+"\n");
            core.debug('Session cache :'+JSON.stringify(snowResponse._sessionCache));
        }
        else {
            core.setFailed("For Basic Auth, Username and Password is mandatory for integration user authentication");
        }
    } catch (e) {
        core.debug('[ServiceNow DevOps] Artifact Registration, Error: '+JSON.stringify(e)+"\n");
        if(e.response && e.response.data) {
            var responseObject=circularSafeStringify(e.response.data);
            core.debug('[ServiceNow DevOps] Artifact Registration, Status code :'+e.response.status+', Response data :'+responseObject+"\n");          
        }

        if (e.message.includes('ECONNREFUSED') || e.message.includes('ENOTFOUND') || e.message.includes('405')) {
            core.setFailed('ServiceNow Instance URL is NOT valid. Please correct the URL and try again.');
        } else if (e.message.includes('401')) {
            core.setFailed('Invalid username and password or Invalid token and toolid. Please correct the input parameters and try again.');
        } else if(e.message.includes('400') || e.message.includes('404')){
            let errMsg = '[ServiceNow DevOps] Artifact Registration is not Successful. ';
            let errMsgSuffix = ' Please provide valid inputs.';
            let responseData = e.response.data;
            if (responseData && responseData.result && responseData.result.errorMessage) {
                errMsg = errMsg + responseData.result.errorMessage + errMsgSuffix;
                core.setFailed(errMsg);
            }
            else if (responseData && responseData.result && responseData.result.details && responseData.result.details.errors) {
                let errors = responseData.result.details.errors;
                for (var index in errors) {
                    errMsg = errMsg + errors[index].message + errMsgSuffix;
                }
                core.setFailed(errMsg);
            }
        } else {
            core.setFailed('ServiceNow Artifact Versions are NOT created. Please check ServiceNow logs for more details.');
        }
    }
} 

)();
