const fetchDeployments = async (owner: string, repo: string, branch: string) => {
  // Fetch deployments from Netlify API
  const netlifyApiUrl = `https://api.netlify.com/api/v1/sites/${process.env.NETLIFY_SITE_ID}/deploys`;
  
  // Get Netlify token from environment variables
  const netlifyToken = process.env.NETLIFY_PERSONAL_ACCESS_TOKEN;
  if (!netlifyToken) {
    throw new Error("Netlify token not configured");
  }
  
  const response = await fetch(netlifyApiUrl, {
    headers: {
      "User-Agent": "PagesCMS",
      "Authorization": `Bearer ${netlifyToken}`,
      "Content-Type": "application/json"
    }
  });
  
  if (!response.ok) {
    throw new Error(`Netlify API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Filter deployments by branch name
  const relevantDeployments = data.filter((deploy: any) => {
    return deploy.branch === branch;
  });

  if (relevantDeployments.length === 0) {
    throw new Error(`No deployments found for branch ${branch}`);
  }

  const recentDeployment = relevantDeployments[0];

  return {
    url: recentDeployment.deploy_url,
    updatedAt: recentDeployment.updated_at,
    status: getState(recentDeployment.state),
  };
}

const getState = (state: string) => {
  switch (state) {
    case "ready":
      return "success";
    case "failed", "error":
      return "failed";
    default:
      return "pending";
  }
}

export { fetchDeployments };
